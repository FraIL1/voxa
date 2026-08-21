import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
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
import { DmService } from './dm.service';

/** Токен живёт долго: переподключения LiveKit не требуют нового */
const TOKEN_TTL = '2h';
/** Сколько звоним, пока не возьмут трубку */
const RING_TIMEOUT_MS = 45_000;
/** Сколько можно сидеть в разговоре одному, прежде чем он закончится сам */
const ALONE_TIMEOUT_MS = 5 * 60_000;

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
  /** Остался один: разговор закончится сам, если никто не придёт */
  aloneTimer?: NodeJS.Timeout;
  /** Кому слать события — участники диалога на момент последнего действия */
  audience: string[];
  /** Строка в переписке, которую этот разговор обновляет по завершении */
  recordId?: string;
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
export class DmCallsService implements OnModuleInit {
  private readonly logger = new Logger(DmCallsService.name);
  private readonly calls = new Map<string, ActiveCall>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly ws: WsGateway,
    private readonly voiceStates: VoiceStateService,
    private readonly dm: DmService,
  ) {}

  /**
   * Разговоры живут в памяти процесса, поэтому после перезапуска не идёт ни
   * один. Незакрытые отметки закрываем, иначе «звонок идёт» висел бы в
   * переписке вечно. Время окончания — момент ответа (или начала, если так
   * и не ответили): сколько на самом деле проговорили, после падения уже
   * не узнать, и лучше показать ноль, чем выдуманные часы.
   */
  /**
   * Закрыл окно, не нажав «завершить» — всё равно выходим из разговора.
   * Без этого ушедший оставался в списке, остальные видели «здесь идёт
   * разговор» с ним внутри, а отметка в переписке не закрывалась.
   */
  private dropFromCalls(userId: string): void {
    for (const [conversationId, call] of this.calls) {
      if (!call.participants.has(userId)) continue;
      void this.leave(userId, conversationId, call.audience).catch((error: Error) => {
        this.logger.warn(`Не удалось вывести ушедшего из разговора: ${error.message}`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    this.ws.onUserOffline((userId) => this.dropFromCalls(userId));

    const closed = await this.prisma.$executeRaw`
      UPDATE dm_messages
      SET call_ended_at = COALESCE(call_started_at, created_at)
      WHERE kind = 'CALL' AND call_ended_at IS NULL
    `;
    if (closed > 0) this.logger.log(`Закрыто повисших отметок о звонках: ${closed}`);
  }

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
    if (call?.aloneTimer) clearTimeout(call.aloneTimer);
    this.calls.delete(conversationId);
  }

  /**
   * Один в разговоре — он не должен висеть вечно: остальные видят «здесь
   * идёт разговор» и заходят в пустоту. Через ALONE_TIMEOUT_MS звонок сам
   * закончится, и в переписке останется отметка с длительностью.
   *
   * Пока идёт дозвон, за временем следит ringTimer — второй отсчёт там ни к
   * чему. Как только людей двое и больше, отсчёт снимается.
   */
  private refreshAloneTimer(conversationId: string): void {
    const call = this.calls.get(conversationId);
    if (!call) return;
    if (call.aloneTimer) {
      clearTimeout(call.aloneTimer);
      call.aloneTimer = undefined;
    }
    if (call.participants.size !== 1 || call.ringTimer) return;

    call.aloneTimer = setTimeout(() => {
      const current = this.calls.get(conversationId);
      if (!current || current.participants.size > 1) return;
      this.logger.log(`Разговор ${conversationId} закончен: остался один`);
      void this.endWithFreshAudience(conversationId, 'timeout').catch((error: Error) => {
        this.logger.warn(`Не удалось закрыть разговор: ${error.message}`);
      });
    }, ALONE_TIMEOUT_MS);
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
      if (!call || call.participants.size > 1) return;
      void this.endWithFreshAudience(conversationId, 'timeout').catch((error: Error) => {
        this.logger.warn(`Не удалось закрыть разговор: ${error.message}`);
      });
    }, RING_TIMEOUT_MS);

    this.calls.set(conversationId, {
      starterId,
      isGroup,
      video,
      invitedIds,
      participants: new Set([starterId]),
      ringTimer,
      audience: participantIds,
    });

    // Отметка в переписке: она же потом покажет длительность разговора
    const record = this.calls.get(conversationId);
    if (record) record.recordId = await this.dm.openCallRecord(conversationId, starterId);

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
    call.audience = participantIds;
    if (call.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = undefined;
    }
    // Пришли — отсчёт одиночества снимается; ушли обратно — начнётся заново
    this.refreshAloneTimer(conversationId);

    const grant = await this.issueToken(userId, conversationId);
    // Инициатору важно знать, что трубку взяли: у него меняется экран
    if (first) {
      this.ws.emitToUsers([call.starterId], WsEvents.DmCallAccepted, { conversationId });
      // С этого момента идёт отсчёт: звонок стал разговором, а не пропущенным
      if (call.recordId) await this.dm.markCallAnswered(call.recordId);
    }
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
    call.audience = participantIds;
    this.refreshAloneTimer(conversationId);
    this.ws.emitToUsers([userId], WsEvents.DmCallEnded, { conversationId, reason: 'ended' });
    await this.broadcastState(conversationId, participantIds);
  }

  /**
   * Завершение по таймеру: состав беседы за это время мог поменяться, а
   * сохранённый список — нет. Перечитываем его, иначе событие о звонке
   * ушло бы и тому, кого уже убрали из беседы.
   */
  private async endWithFreshAudience(
    conversationId: string,
    reason: DmCallEndReason,
  ): Promise<void> {
    const parts = await this.prisma.dmParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    this.end(
      conversationId,
      reason,
      parts.map((p) => p.userId),
    );
  }

  /** Завершение разговора для всех (таймаут, отказ в личке, последний вышел) */
  end(conversationId: string, reason: DmCallEndReason, audience: string[]): void {
    const call = this.calls.get(conversationId);
    if (!call) return;
    const recordId = call.recordId;
    this.clear(conversationId);
    this.ws.emitToUsers(audience, WsEvents.DmCallEnded, { conversationId, reason });
    this.ws.emitToUsers(audience, WsEvents.DmCallState, { conversationId, participants: [] });

    /* Строку в переписке дозакрываем в фоне: разрыв связи не должен ждать
       базу, а не отвеченный звонок так и останется помеченным пропущенным. */
    if (recordId) {
      void this.dm.closeCallRecord(recordId).catch((error: Error) => {
        this.logger.warn(`Не удалось закрыть отметку о звонке: ${error.message}`);
      });
    }
  }

  /** Кто сейчас в разговоре (для открытия диалога с идущим звонком) */
  async stateOf(conversationId: string): Promise<UserPublicDto[]> {
    const call = this.calls.get(conversationId);
    return this.publicUsers([...(call?.participants ?? [])]);
  }
}
