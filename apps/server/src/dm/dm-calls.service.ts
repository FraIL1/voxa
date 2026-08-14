import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WsEvents,
  type DmCallEndReason,
  type UserPublicDto,
  type VoiceTokenDto,
} from '@voxa/shared';
import { AccessToken } from 'livekit-server-sdk';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceStateService } from '../voice/voice-state.service';
import { WsGateway } from '../ws/ws.gateway';

/** Токен живёт долго: переподключения LiveKit не требуют нового */
const TOKEN_TTL = '2h';
/** Сколько звоним, пока не возьмут трубку */
const RING_TIMEOUT_MS = 45_000;

interface ActiveCall {
  /** Кто начал разговор */
  starterId: string;
  isGroup: boolean;
  video: boolean;
  /** Кому звонили; в беседе — все остальные участники */
  invitedIds: string[];
  /** Кто уже внутри комнаты */
  participants: Set<string>;
  ringTimer?: NodeJS.Timeout;
}

/** Комната LiveKit для звонка в личке */
export function dmRoomOf(conversationId: string): string {
  return `dm:${conversationId}`;
}

/**
 * Сигналинг звонков в личке и беседах: состояние живёт в памяти процесса
 * (звонок — короткая сессия, переживать рестарт не нужно). Медиа идёт
 * через LiveKit. В беседе разговор держится, пока в нём есть хоть кто-то,
 * и присоединиться можно в любой момент — не только по звонку.
 */
@Injectable()
export class DmCallsService {
  private readonly logger = new Logger(DmCallsService.name);
  private readonly calls = new Map<string, ActiveCall>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly ws: WsGateway,
    private readonly voiceStates: VoiceStateService,
  ) {}

  /**
   * Разговор может быть только один. Правило держит сервер, а не клиент:
   * на клиенте выход из канала зависел от того, доживёт ли код до конца —
   * упавший разрыв соединения оставлял человека в канале навсегда. Сервер
   * же снимает его безусловно, чем бы ни занимался браузер.
   */
  private dropVoiceChannel(userId: string): void {
    const channelId = this.voiceStates.drop(userId);
    if (channelId) this.ws.broadcastVoiceState(channelId);
  }

  activeCall(conversationId: string): ActiveCall | undefined {
    return this.calls.get(conversationId);
  }

  private clear(conversationId: string): void {
    const call = this.calls.get(conversationId);
    if (call?.ringTimer) clearTimeout(call.ringTimer);
    this.calls.delete(conversationId);
  }

  private async issueToken(userId: string, conversationId: string): Promise<VoiceTokenDto> {
    // Таймаут выдаётся на сервере и личных звонков не касается
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });

    const room = dmRoomOf(conversationId);
    const token = new AccessToken(
      this.config.get('LIVEKIT_API_KEY', { infer: true }),
      this.config.get('LIVEKIT_API_SECRET', { infer: true }),
      { identity: userId, name: me?.displayName ?? '', ttl: TOKEN_TTL },
    );
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

    return {
      url: this.config.get('PUBLIC_LIVEKIT_URL', { infer: true }),
      token: await token.toJwt(),
      channelId: room,
    };
  }

  private async publicUsers(ids: string[]): Promise<UserPublicDto[]> {
    if (ids.length === 0) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
  }

  /** Рассылает всем участникам беседы, кто сейчас в разговоре */
  private async broadcastState(conversationId: string, audience: string[]): Promise<void> {
    const call = this.calls.get(conversationId);
    const participants = await this.publicUsers([...(call?.participants ?? [])]);
    this.ws.emitToUsers(audience, WsEvents.DmCallState, { conversationId, participants });
  }

  /**
   * Начать разговор. Звонок летит всем остальным участникам диалога;
   * инициатор сразу оказывается в комнате.
   */
  async start(
    starterId: string,
    conversationId: string,
    participantIds: string[],
    isGroup: boolean,
    conversationName: string | null,
    video: boolean,
  ): Promise<VoiceTokenDto> {
    this.dropVoiceChannel(starterId);

    const existing = this.calls.get(conversationId);
    if (existing) {
      // Разговор уже идёт — это присоединение, а не новый звонок
      return this.join(starterId, conversationId, participantIds);
    }

    const invitedIds = participantIds.filter((id) => id !== starterId);
    if (invitedIds.length === 0) throw new BadRequestException('Звонить некому');

    const starter = await this.prisma.user.findUniqueOrThrow({
      where: { id: starterId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const grant = await this.issueToken(starterId, conversationId);

    const ringTimer = setTimeout(() => {
      // Никто не взял трубку: в комнате остался только инициатор
      const call = this.calls.get(conversationId);
      if (call && call.participants.size <= 1) this.end(conversationId, 'timeout', participantIds);
    }, RING_TIMEOUT_MS);

    this.calls.set(conversationId, {
      starterId,
      isGroup,
      video,
      invitedIds,
      participants: new Set([starterId]),
      ringTimer,
    });

    this.ws.emitToUsers(invitedIds, WsEvents.DmCallIncoming, {
      conversationId,
      from: starter,
      video,
      isGroup,
      conversationName,
    });
    await this.broadcastState(conversationId, participantIds);
    this.logger.log(`Звонок ${starterId} → ${invitedIds.join(', ')} (диалог ${conversationId})`);
    return grant;
  }

  /** Войти в идущий разговор: по принятию вызова или кнопкой «присоединиться» */
  async join(
    userId: string,
    conversationId: string,
    participantIds: string[],
  ): Promise<VoiceTokenDto> {
    const call = this.calls.get(conversationId);
    if (!call) throw new BadRequestException('Звонок уже завершён');

    // Взял трубку или присоединился — из голосового канала выходим так же
    this.dropVoiceChannel(userId);

    const first = call.participants.size <= 1;
    call.participants.add(userId);
    if (call.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = undefined;
    }

    const grant = await this.issueToken(userId, conversationId);
    // Инициатору важно знать, что трубку взяли: у него меняется экран
    if (first) this.ws.emitToUsers([call.starterId], WsEvents.DmCallAccepted, { conversationId });
    await this.broadcastState(conversationId, participantIds);
    return grant;
  }

  /**
   * Отклонить вызов. В беседе это личный отказ — разговор остальных
   * продолжается; в диалоге один на один отказ завершает звонок.
   */
  decline(userId: string, conversationId: string, participantIds: string[]): void {
    const call = this.calls.get(conversationId);
    if (!call) return;
    if (!call.isGroup) {
      this.end(conversationId, 'declined', participantIds);
      return;
    }
    call.invitedIds = call.invitedIds.filter((id) => id !== userId);
    this.ws.emitToUsers([userId], WsEvents.DmCallEnded, { conversationId, reason: 'declined' });
  }

  /**
   * Выйти из разговора. Последний вышедший гасит комнату для всех —
   * иначе «звонок идёт» висел бы вечно.
   */
  async leave(userId: string, conversationId: string, participantIds: string[]): Promise<void> {
    const call = this.calls.get(conversationId);
    if (!call) return;
    call.participants.delete(userId);

    // Разговор вдвоём без одного из двоих не имеет смысла — гасим сразу
    if (!call.isGroup || call.participants.size === 0) {
      this.end(conversationId, 'ended', participantIds);
      return;
    }
    // Ушедшему — закрыть экран, остальным — обновить список
    this.ws.emitToUsers([userId], WsEvents.DmCallEnded, { conversationId, reason: 'ended' });
    await this.broadcastState(conversationId, participantIds);
  }

  /** Завершение разговора для всех (таймаут, отказ в личке, последний вышел) */
  end(conversationId: string, reason: DmCallEndReason, audience: string[]): void {
    const call = this.calls.get(conversationId);
    if (!call) return;
    this.clear(conversationId);
    this.ws.emitToUsers(audience, WsEvents.DmCallEnded, { conversationId, reason });
    this.ws.emitToUsers(audience, WsEvents.DmCallState, { conversationId, participants: [] });
  }

  /** Кто сейчас в разговоре (для открытия диалога с идущим звонком) */
  async stateOf(conversationId: string): Promise<UserPublicDto[]> {
    const call = this.calls.get(conversationId);
    return this.publicUsers([...(call?.participants ?? [])]);
  }
}
