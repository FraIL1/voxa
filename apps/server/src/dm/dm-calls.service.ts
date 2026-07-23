import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsEvents, type DmCallEndReason, type VoiceTokenDto } from '@voxa/shared';
import { AccessToken } from 'livekit-server-sdk';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

/** Токен живёт долго: переподключения LiveKit не требуют нового */
const TOKEN_TTL = '2h';
/** Сколько звоним, пока не возьмут трубку */
const RING_TIMEOUT_MS = 45_000;

interface ActiveCall {
  callerId: string;
  calleeId: string;
  video: boolean;
  accepted: boolean;
  ringTimer?: NodeJS.Timeout;
}

/** Комната LiveKit для звонка в личке */
export function dmRoomOf(conversationId: string): string {
  return `dm:${conversationId}`;
}

/**
 * Сигналинг звонков 1-на-1: состояние живёт в памяти процесса (звонок —
 * короткая сессия, переживать рестарт не нужно). Медиа идёт через LiveKit.
 */
@Injectable()
export class DmCallsService {
  private readonly logger = new Logger(DmCallsService.name);
  private readonly calls = new Map<string, ActiveCall>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly ws: WsGateway,
  ) {}

  activeCall(conversationId: string): ActiveCall | undefined {
    return this.calls.get(conversationId);
  }

  private clear(conversationId: string): void {
    const call = this.calls.get(conversationId);
    if (call?.ringTimer) clearTimeout(call.ringTimer);
    this.calls.delete(conversationId);
  }

  private async issueToken(userId: string, conversationId: string): Promise<VoiceTokenDto> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timedOutUntil: true, displayName: true },
    });
    if (me?.timedOutUntil && me.timedOutUntil > new Date()) {
      throw new ForbiddenException(`Вы в таймауте до ${me.timedOutUntil.toLocaleString('ru-RU')}`);
    }

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

  /** Начать звонок: собеседнику летит входящий вызов, звонящему — токен */
  async start(
    callerId: string,
    calleeId: string,
    conversationId: string,
    video: boolean,
  ): Promise<VoiceTokenDto> {
    const existing = this.calls.get(conversationId);
    if (existing) {
      // Уже звонит: повторный вызов от того же — просто отдаём токен
      if (existing.callerId === callerId) return this.issueToken(callerId, conversationId);
      throw new BadRequestException('В этом диалоге уже идёт звонок');
    }

    const caller = await this.prisma.user.findUniqueOrThrow({
      where: { id: callerId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const grant = await this.issueToken(callerId, conversationId);

    const ringTimer = setTimeout(() => {
      if (this.calls.get(conversationId)?.accepted === false) {
        this.end(conversationId, 'timeout');
      }
    }, RING_TIMEOUT_MS);

    this.calls.set(conversationId, { callerId, calleeId, video, accepted: false, ringTimer });
    this.ws.emitToUsers([calleeId], WsEvents.DmCallIncoming, {
      conversationId,
      from: caller,
      video,
    });
    this.logger.log(`Звонок ${callerId} → ${calleeId} (диалог ${conversationId})`);
    return grant;
  }

  /** Принять вызов: звонящему летит подтверждение, отвечающему — токен */
  async accept(userId: string, conversationId: string): Promise<VoiceTokenDto> {
    const call = this.calls.get(conversationId);
    if (!call) throw new BadRequestException('Звонок уже завершён');
    if (call.calleeId !== userId) throw new ForbiddenException('Этот вызов адресован не вам');

    if (call.ringTimer) clearTimeout(call.ringTimer);
    this.calls.set(conversationId, { ...call, accepted: true, ringTimer: undefined });

    const grant = await this.issueToken(userId, conversationId);
    this.ws.emitToUsers([call.callerId], WsEvents.DmCallAccepted, { conversationId });
    return grant;
  }

  /** Завершение звонка любым участником (отклонение, сброс, таймаут) */
  end(conversationId: string, reason: DmCallEndReason): void {
    const call = this.calls.get(conversationId);
    if (!call) return;
    this.clear(conversationId);
    this.ws.emitToUsers([call.callerId, call.calleeId], WsEvents.DmCallEnded, {
      conversationId,
      reason,
    });
  }

  /** Токен для того, кто уже в звонке (переподключение вкладки) */
  token(userId: string, conversationId: string): Promise<VoiceTokenDto> {
    return this.issueToken(userId, conversationId);
  }
}
