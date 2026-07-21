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
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { VoiceStateService } from '../voice/voice-state.service';

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function guildRoom(guildId: string): string {
  return `guild:${guildId}`;
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
    private readonly prisma: PrismaService,
  ) {}

  /** Рассылка нового состава голосового канала его подписчикам */
  broadcastVoiceState(channelId: string): void {
    this.emitToChannel(channelId, WsEvents.VoiceUpdate, {
      channelId,
      participants: this.voiceStates.participantsOf(channelId),
    });
  }

  /** Кик/бан: адресное событие и принудительное отключение всех сокетов */
  async forceLogout(userId: string, reason: string): Promise<void> {
    this.emitToUsers([userId], WsEvents.ForceLogout, { reason });
    // Пауза, чтобы событие с причиной успело дойти до разрыва соединения
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const socket of await this.server.in(userRoom(userId)).fetchSockets()) {
      socket.disconnect(true);
    }
  }

  /**
   * Пользователь сменил профиль: обновляем имя в живых сокетах (typing и
   * voice.state шлются с ним), в голосовом присутствии, и оповещаем всех.
   */
  async handleUserRenamed(user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<void> {
    for (const socket of await this.server.in(userRoom(user.id)).fetchSockets()) {
      (socket.data as SocketData).username = user.displayName;
    }

    const voiceChannelId = this.voiceStates.rename(user.id, user.displayName);
    if (voiceChannelId) this.broadcastVoiceState(voiceChannelId);

    this.emitToAll(WsEvents.UserUpdated, {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const auth = socket.handshake.auth as Record<string, unknown>;
      const headerToken = socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      const token = typeof auth?.token === 'string' ? auth.token : headerToken;
      if (!token) throw new Error('token missing');

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);

      // Access-токен живёт 15 минут и сам по себе не отзываем; для сокетов
      // проверяем живость refresh-сессии (баны теперь на уровне сервера
      // и вход в аккаунт не блокируют)
      const [session, user] = await Promise.all([
        this.prisma.refreshSession.findFirst({
          where: { id: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        }),
        this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { displayName: true },
        }),
      ]);
      if (!session || !user) throw new Error('session revoked');

      const data = socket.data as SocketData;
      data.userId = payload.sub;
      // Для отображения (typing, голос) используем displayName, не логин
      data.username = user.displayName;

      const [guildIds, channelIds] = await Promise.all([
        this.usersService.guildIdsOf(payload.sub),
        this.usersService.visibleChannelIdsOf(payload.sub),
      ]);
      await socket.join([
        userRoom(payload.sub),
        ...guildIds.map(guildRoom),
        ...channelIds.map(channelRoom),
      ]);

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
  async handleVoiceState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const data = socket.data as SocketData;
    if (!data.userId || !data.username) return;

    const parsed = voiceStateSchema.safeParse(body);
    if (!parsed.success) return;
    const { channelId, deafened } = parsed.data;
    let { muted } = parsed.data;

    if (channelId !== null && !socket.rooms.has(channelRoom(channelId))) return;

    // Активный таймаут: клиент не может объявить себя размученным
    if (channelId !== null && !muted) {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { timedOutUntil: true },
      });
      if (user?.timedOutUntil && user.timedOutUntil > new Date()) muted = true;
    }

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

  emitToGuild<E extends WsEventName>(guildId: string, event: E, payload: WsServerEvents[E]): void {
    this.server.to(guildRoom(guildId)).emit(event, payload);
  }

  /** Живые сокеты пользователя вступают в комнаты сервера (создание/вступление) */
  async joinUserToGuild(userId: string, guildId: string): Promise<void> {
    const channelIds = await this.usersService.visibleChannelIdsInGuild(userId, guildId);
    this.server
      .in(userRoom(userId))
      .socketsJoin([guildRoom(guildId), ...channelIds.map(channelRoom)]);
  }

  /** Сокеты пользователя покидают комнаты сервера (выход/кик/бан) */
  async removeUserFromGuild(userId: string, guildId: string): Promise<void> {
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      select: { id: true },
    });
    this.server
      .in(userRoom(userId))
      .socketsLeave([guildRoom(guildId), ...channels.map((c) => channelRoom(c.id))]);
  }

  /** Сокеты участников сервера вступают в комнату канала (новый публичный канал) */
  joinGuildToChannel(guildId: string, channelId: string): void {
    this.server.in(guildRoom(guildId)).socketsJoin(channelRoom(channelId));
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
