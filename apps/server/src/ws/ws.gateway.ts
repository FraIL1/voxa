import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  typingSchema,
  voiceStateSchema,
  WsClientEvents,
  WsEvents,
  type WsEventName,
  type WsServerEvents,
} from '@voxa/shared';
import type { Server, Socket } from 'socket.io';

import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from '../users/users.service';
import { VoiceStateService } from '../voice/voice-state.service';

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

interface SocketData {
  userId?: string;
  username?: string;
  /** Последняя отправка typing по каналам: channelId → timestamp (троттлинг) */
  typingAt?: Map<string, number>;
}

/** Чаще, чем раз в это время, typing от сокета по каналу не ретранслируется */
const TYPING_THROTTLE_MS = 2000;

/**
 * Единственный WebSocket-шлюз приложения. Аутентификация — JWT в
 * handshake (auth.token). Комнаты: user:{id} (адресные события) и
 * channel:{id} (события каналов, куда сокет вступает по видимости).
 */
@WebSocketGateway()
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
    private readonly voiceStates: VoiceStateService,
  ) {}

  /** Рассылка нового состава голосового канала его подписчикам */
  private broadcastVoiceState(channelId: string): void {
    this.emitToChannel(channelId, WsEvents.VoiceUpdate, {
      channelId,
      participants: this.voiceStates.participantsOf(channelId),
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const auth = socket.handshake.auth as Record<string, unknown>;
      const headerToken = socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      const token = typeof auth?.token === 'string' ? auth.token : headerToken;
      if (!token) throw new Error('token missing');

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const data = socket.data as SocketData;
      data.userId = payload.sub;
      data.username = payload.username;

      const channelIds = await this.usersService.visibleChannelIdsOf(payload.sub);
      await socket.join([userRoom(payload.sub), ...channelIds.map(channelRoom)]);

      const ready: WsServerEvents[typeof WsEvents.Ready] = {
        userId: payload.sub,
        channelIds,
      };
      socket.emit(WsEvents.Ready, ready);

      // Первый сокет пользователя — все видят его онлайн
      const becameOnline = await this.presence.connected(payload.sub, socket.id);
      if (becameOnline) {
        this.emitToAll(WsEvents.PresenceUpdate, { userId: payload.sub, status: 'online' });
      }
    } catch {
      socket.emit('auth_error', 'Авторизация не пройдена, переподключитесь с новым токеном');
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const data = socket.data as SocketData;
    if (!data.userId) return;

    // Последний сокет закрыт — пользователь ушёл в офлайн
    const wentOffline = await this.presence.disconnected(data.userId, socket.id);
    if (wentOffline) {
      this.emitToAll(WsEvents.PresenceUpdate, { userId: data.userId, status: 'offline' });

      // Оборванное соединение = выход из голосового канала
      const leftChannel = this.voiceStates.drop(data.userId);
      if (leftChannel) this.broadcastVoiceState(leftChannel);
    }
  }

  /**
   * Состояние голоса клиента: вход/выход/мьют. Доступ к каналу уже
   * гарантирован членством сокета в комнате канала.
   */
  @SubscribeMessage(WsClientEvents.VoiceState)
  handleVoiceState(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    const data = socket.data as SocketData;
    if (!data.userId || !data.username) return;

    const parsed = voiceStateSchema.safeParse(body);
    if (!parsed.success) return;
    const { channelId, muted, deafened } = parsed.data;

    if (channelId !== null && !socket.rooms.has(channelRoom(channelId))) return;

    const affected = this.voiceStates.update(
      data.userId,
      data.username,
      channelId,
      muted,
      deafened,
    );
    for (const affectedChannelId of affected) {
      this.broadcastVoiceState(affectedChannelId);
    }
  }

  /**
   * «X печатает…»: ретрансляция остальным подписчикам канала.
   * Сокет должен состоять в комнате канала (видимость уже проверена при
   * подключении); серверный троттлинг защищает от флуда.
   */
  @SubscribeMessage(WsClientEvents.Typing)
  handleTyping(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): void {
    const data = socket.data as SocketData;
    if (!data.userId || !data.username) return;

    const parsed = typingSchema.safeParse(body);
    if (!parsed.success) return;
    const { channelId } = parsed.data;

    if (!socket.rooms.has(channelRoom(channelId))) return;

    const now = Date.now();
    data.typingAt ??= new Map();
    const last = data.typingAt.get(channelId) ?? 0;
    if (now - last < TYPING_THROTTLE_MS) return;
    data.typingAt.set(channelId, now);

    const payload: WsServerEvents[typeof WsEvents.Typing] = {
      channelId,
      userId: data.userId,
      username: data.username,
    };
    socket.to(channelRoom(channelId)).emit(WsEvents.Typing, payload);
  }

  emitToAll<E extends WsEventName>(event: E, payload: WsServerEvents[E]): void {
    this.server.emit(event, payload);
  }

  emitToChannel<E extends WsEventName>(
    channelId: string,
    event: E,
    payload: WsServerEvents[E],
  ): void {
    this.server.to(channelRoom(channelId)).emit(event, payload);
  }

  emitToUsers<E extends WsEventName>(
    userIds: string[],
    event: E,
    payload: WsServerEvents[E],
  ): void {
    if (userIds.length === 0) return;
    this.server.to(userIds.map(userRoom)).emit(event, payload);
  }

  /** Все подключённые сокеты вступают в комнату канала (новый публичный канал) */
  joinAllToChannel(channelId: string): void {
    this.server.socketsJoin(channelRoom(channelId));
  }

  /** Комнату канала покидают все (канал удалён) */
  removeChannelRoom(channelId: string): void {
    this.server.socketsLeave(channelRoom(channelId));
  }

  /**
   * Синхронизация членства в комнате приватного канала: сокеты допущенных
   * пользователей вступают, остальные покидают.
   */
  syncPrivateChannelMembership(
    channelId: string,
    allowedUserIds: string[],
    allUserIds: string[],
  ): void {
    const allowed = new Set(allowedUserIds);
    for (const userId of allUserIds) {
      const target = this.server.in(userRoom(userId));
      if (allowed.has(userId)) target.socketsJoin(channelRoom(channelId));
      else target.socketsLeave(channelRoom(channelId));
    }
  }
}
