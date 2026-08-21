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
  type PresenceMode,
  type PresenceStatus,
  type WsEventName,
  type WsServerEvents,
} from '@voxa/shared';
import type { Server, Socket } from 'socket.io';

import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LiveKitAdminService } from '../voice/livekit-admin.service';
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

  /**
   * Кого позвать, когда человек ушёл из приложения совсем (закрыл последнее
   * окно). Через подписку, а не прямым вызовом: иначе шлюз и служба звонков
   * ссылались бы друг на друга.
   */
  private readonly offlineHandlers: ((userId: string) => void)[] = [];

  onUserOffline(handler: (userId: string) => void): void {
    this.offlineHandlers.push(handler);
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
    private readonly voiceStates: VoiceStateService,
    private readonly livekit: LiveKitAdminService,
    private readonly prisma: PrismaService,
  ) {}

  /** Рассылка нового состава голосового канала его подписчикам */
  broadcastVoiceState(channelId: string): void {
    this.emitToChannel(channelId, WsEvents.VoiceUpdate, {
      channelId,
      guildId: this.voiceStates.guildOf(channelId),
      participants: this.voiceStates.participantsOf(channelId),
    });
  }

  /**
   * Пересобрать подписки живых сокетов человека.
   *
   * Комнаты назначаются один раз при подключении. Если после этого доступ
   * изменился — выгнали с сервера, сняли роль, канал закрыли, — сокет
   * оставался подписан и продолжал получать новые сообщения в реальном
   * времени, пока человек не переподключится. Вызывать всюду, где меняется
   * состав участников или видимость каналов.
   */
  async refreshRooms(userId: string): Promise<void> {
    const [guildIds, channelIds] = await Promise.all([
      this.usersService.guildIdsOf(userId),
      this.usersService.visibleChannelIdsOf(userId),
    ]);
    const visible = new Set(channelIds);

    /* Потерял доступ к голосовому каналу — выселяем и с медиасервера.
       Выданный токен живёт два часа и сам по себе доступ не отзывает:
       без этого снятая роль ещё долго позволяла бы слушать закрытый
       голосовой канал, даже когда из списка он уже пропал. */
    const voiceChannelId = this.voiceStates.channelOf(userId);
    if (voiceChannelId && !visible.has(voiceChannelId)) {
      this.voiceStates.drop(userId);
      this.broadcastVoiceState(voiceChannelId);
      await this.livekit.removeFromRoom(voiceChannelId, userId).catch((error: Error) => {
        this.logger.warn(`Не удалось выселить из голосового канала: ${error.message}`);
      });
    }

    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    if (sockets.length === 0) return;

    const wanted = new Set([
      userRoom(userId),
      ...guildIds.map(guildRoom),
      ...channelIds.map(channelRoom),
    ]);

    for (const socket of sockets) {
      for (const room of socket.rooms) {
        // Личная комната самого сокета (его id) — служебная, её не трогаем
        if (room === socket.id || wanted.has(room)) continue;
        socket.leave(room);
      }
      for (const room of wanted) {
        if (!socket.rooms.has(room)) socket.join(room);
      }
    }
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

    // Только тем, кто этого человека и так знает: логин посторонним не нужен
    this.emitToUsers(await this.usersService.observerIdsOf(user.id), WsEvents.UserUpdated, {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });
  }

  /** Разослать новое присутствие тем, кто этого человека знает */
  private async emitPresence(userId: string, status: PresenceStatus): Promise<void> {
    this.emitToUsers(await this.usersService.observerIdsOf(userId), WsEvents.PresenceUpdate, {
      userId,
      status,
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
          select: {
            displayName: true,
            presenceMode: true,
            instanceBan: { select: { userId: true } },
          },
        }),
      ]);
      if (!session || !user || user.instanceBan) throw new Error('session revoked or banned');

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

      // Сокет регистрируем до Ready: тогда в нём уже верный статус, и новый
      // клиент не показывает «в сети», пока другое окно простаивает
      const becameOnline = await this.presence.connected(payload.sub, socket.id, user.presenceMode);

      const ready: WsServerEvents[typeof WsEvents.Ready] = {
        userId: payload.sub,
        channelIds,
        status: this.presence.statusOf(payload.sub),
      };
      socket.emit(WsEvents.Ready, ready);

      if (becameOnline) {
        await this.emitPresence(payload.sub, this.presence.statusOf(payload.sub));
      }
    } catch {
      socket.emit('auth_error', 'Авторизация не пройдена, переподключитесь с новым токеном');
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const data = socket.data as SocketData;
    if (!data.userId) return;

    // Закрытие активного окна может сделать человека отошедшим: остальные
    // его окна свёрнуты — тогда статус меняется и без ухода в офлайн
    const before = this.presence.statusOf(data.userId);
    const wentOffline = await this.presence.disconnected(data.userId, socket.id);
    const after = this.presence.statusOf(data.userId);
    if (!wentOffline && before !== after) {
      await this.emitPresence(data.userId, after);
    }
    if (wentOffline) {
      await this.emitPresence(data.userId, 'offline');

      // Оборванное соединение = выход из голосового канала
      const leftChannel = this.voiceStates.drop(data.userId);
      if (leftChannel) this.broadcastVoiceState(leftChannel);

      // И выход из разговора в личке: иначе он висел бы с ушедшим внутри
      for (const handler of this.offlineHandlers) handler(data.userId);
    }
  }

  /**
   * Клиент сообщает, что человек отошёл (нет действий несколько минут)
   * или вернулся. Статус «отошёл» ставим только тем, кто в обычном режиме.
   */
  @SubscribeMessage(WsClientEvents.PresenceIdle)
  async handleIdle(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<void> {
    const data = socket.data as SocketData;
    if (!data.userId) return;
    const idle = typeof body === 'object' && body !== null && 'idle' in body && Boolean(body.idle);
    const before = this.presence.statusOf(data.userId);
    this.presence.setIdle(data.userId, socket.id, idle);
    const after = this.presence.statusOf(data.userId);
    if (before !== after) {
      await this.emitPresence(data.userId, after);
    }
  }

  /** Смена режима из настроек: обновляем кэш и рассылаем новый статус */
  async broadcastPresenceMode(userId: string, mode: PresenceMode): Promise<void> {
    this.presence.setMode(userId, mode);
    await this.emitPresence(userId, this.presence.statusOf(userId));
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
    const { channelId, deafened, sharing } = parsed.data;
    let { muted } = parsed.data;

    if (channelId !== null && !socket.rooms.has(channelRoom(channelId))) return;

    /* Сервер канала нужен и для таймаута, и для того, чтобы из списка друзей
       можно было перейти прямо в этот голосовой. При переключении мьюта
       канал тот же — берём уже известный, лишний запрос ни к чему. */
    let guildId: string | null = null;
    if (channelId !== null) {
      const known = this.voiceStates.locationOf(data.userId);
      if (known?.channelId === channelId) {
        guildId = known.guildId;
      } else {
        const channel = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { guildId: true },
        });
        guildId = channel?.guildId ?? null;
      }
      if (!guildId) return;

      // Активный таймаут сервера: клиент не может объявить себя размученным
      if (!muted && (await this.usersService.timeoutOf(guildId, data.userId))) {
        muted = true;
      }
    }

    const affected = this.voiceStates.update(
      data.userId,
      data.username,
      channelId,
      guildId,
      muted,
      deafened,
      sharing,
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
