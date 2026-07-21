import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  API_PREFIX,
  Permissions,
  WsClientEvents,
  WsEvents,
  type AuthResponseDto,
  type CommunityStructureDto,
  type MeDto,
  type MemberDto,
  type MessageDto,
  type MessagesPageDto,
  type ReadStateDto,
  type ReadStateUpdatedPayload,
  type TypingPayload,
} from '@voxa/shared';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { RedisIoAdapter } from '../src/ws/redis-io.adapter';

const OWNER = { username: 'Артём', password: 'корректный-длинный-пароль-1' };
const MEMBER = { username: 'Мария', password: 'другой-длинный-пароль-22' };

function refreshCookieOf(res: request.Response): string {
  const setCookie = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const cookie = cookies.find((c) => c.startsWith('voxa_refresh='));
  if (!cookie) throw new Error('Ответ не содержит refresh-cookie');
  return cookie.split(';')[0] ?? '';
}

describe('Voxa: критический поток (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let httpServer: Parameters<typeof request>[0];
  let baseUrl: string;
  let socket: Socket | undefined;

  let ownerInviteCode: string;
  let guildId: string;
  let ownerAccess: string;
  let ownerRefreshCookie: string;
  let memberAccess: string;
  let generalChannelId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Та же конфигурация, что в main.ts
    app.setGlobalPrefix(API_PREFIX);
    app.use(cookieParser());
    app.useWebSocketAdapter(new RedisIoAdapter(app, process.env.REDIS_URL as string));
    await app.listen(0, '127.0.0.1');

    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const { port } = (app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    socket?.disconnect();
    await app.close();
    await prisma.$disconnect();
  });

  it('healthz отвечает без авторизации', async () => {
    const res = await request(httpServer).get('/api/healthz').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('сид создал структуру и bootstrap-инвайт Владельца', async () => {
    expect(await prisma.role.count()).toBe(3);
    expect(await prisma.channel.count()).toBe(6);

    const invite = await prisma.invite.findFirstOrThrow({
      where: { grantsRole: { isOwnerRole: true }, revokedAt: null },
    });
    ownerInviteCode = invite.code;
  });

  it('регистрация с несуществующим инвайтом отклоняется', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: 'nope-nope-nope', ...OWNER })
      .expect(400);
  });

  it('регистрация со слабым паролем отклоняется валидацией', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: ownerInviteCode, username: OWNER.username, password: 'короткий' })
      .expect(400);
  });

  it('первый пользователь регистрируется по bootstrap-инвайту и становится Владельцем', async () => {
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: ownerInviteCode, ...OWNER })
      .expect(201);

    const body = res.body as AuthResponseDto;
    expect(body.user.username).toBe(OWNER.username);

    ownerAccess = body.accessToken;
    ownerRefreshCookie = refreshCookieOf(res);

    // Владелец состоит в стартовом сервере «Voxa» с правами администратора
    const guilds = await request(httpServer)
      .get('/api/guilds')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect(guilds.body).toHaveLength(1);
    expect(guilds.body[0].name).toBe('Voxa');
    expect(guilds.body[0].ownerId).toBe(body.user.id);
    expect(guilds.body[0].myPermissions & Permissions.ADMINISTRATOR).toBe(
      Permissions.ADMINISTRATOR,
    );
    guildId = guilds.body[0].id as string;
  });

  it('одноразовый bootstrap-инвайт больше не работает', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: ownerInviteCode, ...MEMBER })
      .expect(400);
  });

  it('вход с неверным паролем отклоняется', async () => {
    await request(httpServer)
      .post('/api/auth/login')
      .send({ username: OWNER.username, password: 'совсем-не-тот-пароль-99' })
      .expect(401);
  });

  it('ротация refresh-токена; свежий повтор (гонка вкладок) не гасит семейство', async () => {
    // Ротация: старый cookie обменивается на новый
    const rotated = await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', ownerRefreshCookie)
      .expect(200);
    const newCookie = refreshCookieOf(rotated);
    expect(newCookie).not.toBe(ownerRefreshCookie);

    // Повтор старого токена всегда отклоняется (он уже обменян)
    await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', ownerRefreshCookie)
      .expect(401);

    // Но свежий повтор (< 10 с) — гонка двух вкладок, а не кража: семейство
    // НЕ гасится, легитимный новый токен продолжает работать (фикс вылета)
    const stillValid = await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', newCookie)
      .expect(200);
    ownerAccess = (stillValid.body as AuthResponseDto).accessToken;
    ownerRefreshCookie = refreshCookieOf(stillValid);
  });

  it('владелец создаёт обычный инвайт, по нему регистрируется участник', async () => {
    const created = await request(httpServer)
      .post(`/api/guilds/${guildId}/invites`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ maxUses: 5, expiresInHours: 24 })
      .expect(201);

    const check = await request(httpServer)
      .get(`/api/invites/check/${created.body.code}`)
      .expect(200);
    expect(check.body.valid).toBe(true);

    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: created.body.code, ...MEMBER })
      .expect(201);
    const body = res.body as AuthResponseDto;
    memberAccess = body.accessToken;

    // Регистрация по инвайту = вступление на его сервер (без прав админа)
    const guilds = await request(httpServer)
      .get('/api/guilds')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    expect(guilds.body).toHaveLength(1);
    expect(guilds.body[0].id).toBe(guildId);
    expect(guilds.body[0].myPermissions & Permissions.ADMINISTRATOR).toBe(0);
  });

  it('участник без права «Управление каналами» получает 403', async () => {
    await request(httpServer)
      .post(`/api/guilds/${guildId}/channels`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ name: 'хакерский', type: 'TEXT' })
      .expect(403);
  });

  it('структура сообщества доступна и содержит #общий', async () => {
    const res = await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);

    const structure = res.body as CommunityStructureDto;
    expect(structure.categories).toHaveLength(2);
    const textCategory = structure.categories.find((c) => c.name === 'Текст');
    const general = textCategory?.channels.find((c) => c.name === 'общий');
    expect(general).toBeDefined();
    generalChannelId = (general as { id: string }).id;
  });

  it('запрос без токена отклоняется', async () => {
    await request(httpServer).get(`/api/guilds/${guildId}/structure`).expect(401);
  });

  it('WebSocket отклоняет подключение с неверным токеном', async () => {
    const badSocket = io(baseUrl, { auth: { token: 'invalid' }, transports: ['websocket'] });
    const reason = await new Promise<string>((resolve) => {
      badSocket.on('auth_error', () => resolve('auth_error'));
      badSocket.on('disconnect', () => resolve('disconnect'));
    });
    expect(['auth_error', 'disconnect']).toContain(reason);
    badSocket.disconnect();
  });

  it('сообщение доставляется по WebSocket (message.new) и сохраняется в истории', async () => {
    socket = io(baseUrl, { auth: { token: ownerAccess }, transports: ['websocket'] });

    const ready = await new Promise<{ userId: string; channelIds: string[] }>((resolve, reject) => {
      socket?.once(WsEvents.Ready, resolve);
      socket?.once('auth_error', () => reject(new Error('WS-авторизация не прошла')));
    });
    expect(ready.channelIds).toContain(generalChannelId);

    const received = new Promise<MessageDto>((resolve) => {
      socket?.once(WsEvents.MessageNew, resolve);
    });

    const sent = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'Привет, **Voxa**!' })
      .expect(201);

    const wsMessage = await received;
    expect(wsMessage.id).toBe(sent.body.id);
    expect(wsMessage.content).toBe('Привет, **Voxa**!');
    expect(wsMessage.author?.username).toBe(OWNER.username);

    const history = await request(httpServer)
      .get(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const page = history.body as MessagesPageDto;
    expect(page.items[0]?.id).toBe(sent.body.id);
    expect(page.hasMore).toBe(false);
  });

  it('ответ (reply) на сообщение из другого канала отклоняется', async () => {
    const res = await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const structure = res.body as CommunityStructureDto;
    const memes = structure.categories
      .flatMap((c) => c.channels)
      .find((c) => c.name === 'мемы') as { id: string };

    const history = await request(httpServer)
      .get(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`);
    const existingId = (history.body as MessagesPageDto).items[0]?.id as string;

    await request(httpServer)
      .post(`/api/channels/${memes.id}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'ответ не туда', replyToId: existingId })
      .expect(400);
  });

  it('правка своего сообщения рассылается (message.edit), чужого — запрещена', async () => {
    const sent = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'до правки' })
      .expect(201);

    const edited = new Promise<MessageDto>((resolve) => {
      socket?.once(WsEvents.MessageEdited, resolve);
    });

    await request(httpServer)
      .patch(`/api/channels/${generalChannelId}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'после правки' })
      .expect(200);

    const wsMessage = await edited;
    expect(wsMessage.id).toBe(sent.body.id);
    expect(wsMessage.content).toBe('после правки');
    expect(wsMessage.editedAt).toBeTruthy();

    // Участник не может править чужое сообщение
    await request(httpServer)
      .patch(`/api/channels/${generalChannelId}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'взлом' })
      .expect(403);
  });

  it('реакции: идемпотентная постановка, снятие и события WS', async () => {
    const me = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    const memberId = (me.body as MeDto).id;

    const target = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'поставьте мне реакцию' })
      .expect(201);
    const emoji = encodeURIComponent('🔥');

    const addEvents: unknown[] = [];
    const onAdd = (p: unknown): void => {
      addEvents.push(p);
    };
    socket?.on(WsEvents.ReactionAdded, onAdd);

    await request(httpServer)
      .put(`/api/channels/${generalChannelId}/messages/${target.body.id}/reactions/${emoji}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(204);
    // Повторная постановка идемпотентна и не порождает второе событие
    await request(httpServer)
      .put(`/api/channels/${generalChannelId}/messages/${target.body.id}/reactions/${emoji}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(204);

    await new Promise((r) => setTimeout(r, 300));
    socket?.off(WsEvents.ReactionAdded, onAdd);
    expect(addEvents).toHaveLength(1);

    const history = await request(httpServer)
      .get(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const withReaction = (history.body as MessagesPageDto).items.find(
      (m) => m.id === target.body.id,
    );
    expect(withReaction?.reactions).toEqual([{ emoji: '🔥', userId: memberId }]);

    const removed = new Promise((resolve) => {
      socket?.once(WsEvents.ReactionRemoved, resolve);
    });
    await request(httpServer)
      .delete(`/api/channels/${generalChannelId}/messages/${target.body.id}/reactions/${emoji}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(204);
    await removed;
  });

  it('ответ с превью; чужое удаляет только модератор (message.delete)', async () => {
    const original = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'оригинал для ответа' })
      .expect(201);

    const reply = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'ответ с превью', replyToId: original.body.id })
      .expect(201);
    expect((reply.body as MessageDto).replyTo).toEqual({
      id: original.body.id,
      authorUsername: MEMBER.username,
      excerpt: 'оригинал для ответа',
    });

    // Участник не может удалить чужое сообщение
    await request(httpServer)
      .delete(`/api/channels/${generalChannelId}/messages/${reply.body.id}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(403);

    // Владелец (ADMINISTRATOR ⊃ DELETE_MESSAGES) удаляет сообщение участника
    const deleted = new Promise<{ id: string }>((resolve) => {
      socket?.once(WsEvents.MessageDeleted, resolve);
    });
    await request(httpServer)
      .delete(`/api/channels/${generalChannelId}/messages/${original.body.id}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    expect((await deleted).id).toBe(original.body.id);

    // Удалённого нет в истории, а превью ответа на него обнулено
    const history = await request(httpServer)
      .get(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const items = (history.body as MessagesPageDto).items;
    expect(items.some((m) => m.id === original.body.id)).toBe(false);
    const replyRow = items.find((m) => m.id === reply.body.id);
    expect(replyRow?.replyTo?.excerpt).toBeNull();
  });

  it('событие typing ретранслируется другим участникам канала', async () => {
    const memberSocket = io(baseUrl, { auth: { token: memberAccess }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      memberSocket.once(WsEvents.Ready, resolve);
      memberSocket.once('auth_error', () => reject(new Error('WS-авторизация не прошла')));
    });

    const typing = new Promise<TypingPayload>((resolve) => {
      socket?.once(WsEvents.Typing, resolve);
    });
    memberSocket.emit(WsClientEvents.Typing, { channelId: generalChannelId });

    const payload = await typing;
    expect(payload.channelId).toBe(generalChannelId);
    expect(payload.username).toBe(MEMBER.username);
    memberSocket.disconnect();
  });

  it('голосовой токен: комната = канал, права publish/subscribe; текстовый канал — 400', async () => {
    const structure = await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const voiceChannel = (structure.body as CommunityStructureDto).categories
      .flatMap((c) => c.channels)
      .find((c) => c.type === 'VOICE') as { id: string };

    const res = await request(httpServer)
      .post(`/api/channels/${voiceChannel.id}/voice-token`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(201);

    expect(res.body.url).toBeTruthy();
    expect(res.body.channelId).toBe(voiceChannel.id);

    // Полезная нагрузка JWT: комната и права
    const payloadPart = (res.body.token as string).split('.')[1] as string;
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString()) as {
      video: { room: string; roomJoin: boolean; canPublish: boolean; canSubscribe: boolean };
      name: string;
    };
    expect(claims.video.room).toBe(voiceChannel.id);
    expect(claims.video.roomJoin).toBe(true);
    expect(claims.video.canPublish).toBe(true);
    expect(claims.video.canSubscribe).toBe(true);
    expect(claims.name).toBe(OWNER.username);

    // Для текстового канала токен не выдаётся
    await request(httpServer)
      .post(`/api/channels/${generalChannelId}/voice-token`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(400);
  });

  it('voice.state через WS: участник появляется в /voice/states и рассылается voice.update', async () => {
    const structure = await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const voiceChannel = (structure.body as CommunityStructureDto).categories
      .flatMap((c) => c.channels)
      .find((c) => c.type === 'VOICE') as { id: string };

    const updated = new Promise<{ channelId: string; participants: { username: string }[] }>(
      (resolve) => {
        socket?.once(WsEvents.VoiceUpdate, resolve);
      },
    );

    // Владелец «входит» в голосовой канал (его сокет уже подключён)
    socket?.emit(WsClientEvents.VoiceState, {
      channelId: voiceChannel.id,
      muted: false,
      deafened: false,
    });

    const event = await updated;
    expect(event.channelId).toBe(voiceChannel.id);
    expect(event.participants.map((p) => p.username)).toContain(OWNER.username);

    const states = await request(httpServer)
      .get('/api/voice/states')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const state = (states.body as { channelId: string; participants: unknown[] }[]).find(
      (s) => s.channelId === voiceChannel.id,
    );
    expect(state?.participants).toHaveLength(1);

    // Выход из голоса
    const left = new Promise<{ participants: unknown[] }>((resolve) => {
      socket?.once(WsEvents.VoiceUpdate, resolve);
    });
    socket?.emit(WsClientEvents.VoiceState, { channelId: null, muted: false, deafened: false });
    expect((await left).participants).toHaveLength(0);
  });

  it('GET /users: статусы присутствия и роли участников', async () => {
    const res = await request(httpServer)
      .get(`/api/guilds/${guildId}/members`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);

    const members = res.body as MemberDto[];
    const owner = members.find((m) => m.username === OWNER.username);
    const member = members.find((m) => m.username === MEMBER.username);

    // Сокет владельца подключён с прошлых тестов, участника — уже отключён
    expect(owner?.status).toBe('online');
    expect(member?.status).toBe('offline');
    expect(owner?.roles[0]?.name).toBe('Владелец');
    expect(member?.roles[0]?.name).toBe('Участник');
  });

  it('упоминание увеличивает счётчик; ack сбрасывает и рассылает readstate.update', async () => {
    await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: `Смотри, @${OWNER.username}!` })
      .expect(201);

    const before = await request(httpServer)
      .get('/api/read-states')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const state = (before.body as ReadStateDto[]).find((s) => s.channelId === generalChannelId);
    expect(state?.mentionCount).toBe(1);
    expect(state?.unreadCount).toBeGreaterThan(0);

    const updated = new Promise<ReadStateUpdatedPayload>((resolve) => {
      socket?.once(WsEvents.ReadStateUpdated, resolve);
    });

    const history = await request(httpServer)
      .get(`/api/channels/${generalChannelId}/messages?limit=1`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const newestId = (history.body as MessagesPageDto).items[0]?.id as string;

    const ack = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/ack`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ messageId: newestId })
      .expect(201);
    const acked = ack.body as ReadStateDto;
    expect(acked.unreadCount).toBe(0);
    expect(acked.mentionCount).toBe(0);
    expect(acked.lastReadMessageId).toBe(newestId);

    const event = await updated;
    expect(event.channelId).toBe(generalChannelId);
    expect(event.lastReadMessageId).toBe(newestId);
  });

  it('загрузка PNG, отправка с вложением; исполняемый файл отклоняется', async () => {
    // Однопиксельный валидный PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const uploaded = await request(httpServer)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .attach('file', png, 'pixel.png')
      .expect(201);
    expect(uploaded.body.kind).toBe('image');
    expect(uploaded.body.contentType).toBe('image/png');
    expect(uploaded.body.thumbUrl).toBeTruthy();

    // Сообщение без текста, только вложение
    const sent = await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: '', attachmentIds: [uploaded.body.id] })
      .expect(201);
    const message = sent.body as MessageDto;
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]?.url).toContain('voxa-e2e');

    // Скачивание по подписанной ссылке возвращает исходные байты
    const download = await fetch(message.attachments[0]?.url as string);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).equals(png)).toBe(true);

    // Чужое вложение второй раз использовать нельзя
    await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'краду вложение', attachmentIds: [uploaded.body.id] })
      .expect(400);

    // Исполняемый файл (PE, «MZ») отклоняется
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    await request(httpServer)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .attach('file', exe, 'game.png')
      .expect(400);
  });

  it('смена отображаемого имени: PATCH /users/me, рассылка user.updated; логин неизменен', async () => {
    const broadcast = new Promise<{ id: string; username: string; displayName: string }>(
      (resolve) => {
        socket?.once(WsEvents.UserUpdated, resolve);
      },
    );

    const renamed = await request(httpServer)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ displayName: 'Тёмыч' })
      .expect(200);
    expect((renamed.body as MeDto).displayName).toBe('Тёмыч');
    // Логин (username) остаётся неизменным
    expect((renamed.body as MeDto).username).toBe(OWNER.username);

    // Все клиенты получают событие для обновления кэшей
    const event = await broadcast;
    expect(event.displayName).toBe('Тёмыч');
    expect(event.username).toBe(OWNER.username);

    // Отображаемые имена могут совпадать у разных людей — конфликта нет
    await request(httpServer)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ displayName: 'Тёмыч' })
      .expect(200);

    // Возвращаем как было
    await request(httpServer)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ displayName: OWNER.username })
      .expect(200);
  });

  it('таймаут запрещает писать и говорить; снятие — возвращает', async () => {
    const me = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    const memberId = (me.body as MeDto).id;

    const res = await request(httpServer)
      .post(`/api/guilds/${guildId}/members/${memberId}/timeout`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ minutes: 5, reason: 'спам' })
      .expect(201);
    expect(res.body.until).toBeTruthy();

    // Писать нельзя
    await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'в таймауте' })
      .expect(403);

    // И в голос нельзя
    const structure = await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`);
    const voiceChannel = (structure.body as CommunityStructureDto).categories
      .flatMap((c) => c.channels)
      .find((c) => c.type === 'VOICE') as { id: string };
    await request(httpServer)
      .post(`/api/channels/${voiceChannel.id}/voice-token`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(403);

    // Снятие таймаута
    await request(httpServer)
      .delete(`/api/guilds/${guildId}/members/${memberId}/timeout`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    await request(httpServer)
      .post(`/api/channels/${generalChannelId}/messages`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'таймаут снят' })
      .expect(201);
  });

  it('кик убирает с сервера; бан запрещает вступление; разбан возвращает', async () => {
    const invite = await request(httpServer)
      .post(`/api/guilds/${guildId}/invites`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ maxUses: 5 })
      .expect(201);

    const victim = { username: 'Нарушитель', password: 'пароль-нарушителя-123' };
    const registered = await request(httpServer)
      .post('/api/auth/register')
      .send({ inviteCode: invite.body.code, ...victim })
      .expect(201);
    const victimId = (registered.body as AuthResponseDto).user.id;
    const victimAccess = (registered.body as AuthResponseDto).accessToken;

    // Кик: аккаунт жив, но сервера в списке больше нет и структура закрыта
    await request(httpServer)
      .post(`/api/guilds/${guildId}/members/${victimId}/kick`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ reason: 'проверка' })
      .expect(204);
    await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);
    const afterKick = await request(httpServer)
      .get('/api/guilds')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);
    expect(afterKick.body).toHaveLength(0);
    await request(httpServer)
      .get(`/api/guilds/${guildId}/structure`)
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(403);

    // Кикнутый может вернуться по инвайту
    await request(httpServer)
      .post(`/api/invites/${invite.body.code}/join`)
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);

    // Бан: убирает с сервера и запрещает вступление по инвайту
    await request(httpServer)
      .post(`/api/guilds/${guildId}/members/${victimId}/ban`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ reason: 'нарушение правил' })
      .expect(204);
    const denied = await request(httpServer)
      .post(`/api/invites/${invite.body.code}/join`)
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(403);
    expect(denied.body.message).toContain('нарушение правил');

    // Повторный бан бессмыслен — 400
    await request(httpServer)
      .post(`/api/guilds/${guildId}/members/${victimId}/ban`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({})
      .expect(400);

    // Участник без прав не видит списка банов
    await request(httpServer)
      .get(`/api/guilds/${guildId}/bans`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(403);

    // Владелец видит бан в списке
    const bans = await request(httpServer)
      .get(`/api/guilds/${guildId}/bans`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect(bans.body.some((b: { userId: string }) => b.userId === victimId)).toBe(true);

    // Разбан возвращает возможность вступить
    await request(httpServer)
      .delete(`/api/guilds/${guildId}/bans/${victimId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    await request(httpServer)
      .post(`/api/invites/${invite.body.code}/join`)
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);

    // Владельца нельзя модерировать даже владельцу (сам себя — 400)
    const ownerMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerAccess}`);
    await request(httpServer)
      .post(`/api/guilds/${guildId}/members/${(ownerMe.body as MeDto).id}/ban`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({})
      .expect(400);
  });

  it('журнал аудита и обзор доступны только администратору', async () => {
    await request(httpServer)
      .get(`/api/guilds/${guildId}/audit`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(403);

    const audit = await request(httpServer)
      .get(`/api/guilds/${guildId}/audit?limit=50`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const actions = (audit.body.items as { action: string }[]).map((i) => i.action);
    expect(actions).toContain('user.ban');
    expect(actions).toContain('user.kick');
    expect(actions).toContain('user.timeout');
    expect(actions).toContain('invite.create');

    const overview = await request(httpServer)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect(overview.body.usersTotal).toBeGreaterThanOrEqual(3);
    expect(overview.body.serverVersion).toBeTruthy();
  });

  it('личные сообщения: диалог, доставка обоим по WS, непрочитанные, доступ', async () => {
    const ownerMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerAccess}`);
    const memberMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAccess}`);
    const ownerId = (ownerMe.body as MeDto).id;
    const memberId = (memberMe.body as MeDto).id;

    // Владелец открывает диалог с участником
    const opened = await request(httpServer)
      .post('/api/dm/conversations')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ userId: memberId })
      .expect(201);
    const conversationId = opened.body.id as string;

    // Повторное открытие — тот же диалог (одна строка на пару)
    const reopened = await request(httpServer)
      .post('/api/dm/conversations')
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ userId: ownerId })
      .expect(201);
    expect(reopened.body.id).toBe(conversationId);

    // Участник слушает своё адресное DM-событие
    const memberSocket = io(baseUrl, { auth: { token: memberAccess }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      memberSocket.once(WsEvents.Ready, resolve);
      memberSocket.once('auth_error', () => reject(new Error('WS-авторизация не прошла')));
    });
    const delivered = new Promise<{ conversationId: string; content: string }>((resolve) => {
      memberSocket.once(WsEvents.DmMessageNew, resolve);
    });

    const sent = await request(httpServer)
      .post(`/api/dm/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'Привет в личку!' })
      .expect(201);
    expect(sent.body.author.username).toBe(OWNER.username);

    const wsMessage = await delivered;
    expect(wsMessage.conversationId).toBe(conversationId);
    expect(wsMessage.content).toBe('Привет в личку!');

    // У участника диалог с 1 непрочитанным
    const list = await request(httpServer)
      .get('/api/dm/conversations')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    const conv = (
      list.body as { id: string; unreadCount: number; peer: { username: string } }[]
    ).find((c) => c.id === conversationId);
    expect(conv?.unreadCount).toBe(1);
    expect(conv?.peer.username).toBe(OWNER.username);

    // Ack сбрасывает непрочитанные
    await request(httpServer)
      .post(`/api/dm/conversations/${conversationId}/ack`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ messageId: sent.body.id })
      .expect(204);
    const afterAck = await request(httpServer)
      .get('/api/dm/conversations')
      .set('Authorization', `Bearer ${memberAccess}`);
    expect(
      (afterAck.body as { id: string; unreadCount: number }[]).find((c) => c.id === conversationId)
        ?.unreadCount,
    ).toBe(0);

    // Правка только своего сообщения (участник не может чужое)
    await request(httpServer)
      .patch(`/api/dm/conversations/${conversationId}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ content: 'взлом' })
      .expect(403);

    // Третий пользователь не имеет доступа к чужому диалогу
    const outsiderInvite = await request(httpServer)
      .post(`/api/guilds/${guildId}/invites`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ maxUses: 1 })
      .expect(201);
    const outsider = await request(httpServer)
      .post('/api/auth/register')
      .send({
        inviteCode: outsiderInvite.body.code,
        username: 'Чужак',
        password: 'пароль-чужака-123',
      })
      .expect(201);
    await request(httpServer)
      .get(`/api/dm/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${(outsider.body as AuthResponseDto).accessToken}`)
      .expect(403);

    memberSocket.disconnect();
  });

  it('друзья: заявка с доставкой по WS, принятие, блокировка закрывает ЛС', async () => {
    const ownerMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerAccess}`);
    const memberMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAccess}`);
    const ownerId = (ownerMe.body as MeDto).id;
    const memberId = (memberMe.body as MeDto).id;

    // Участник слушает адресное событие о новой заявке
    const memberSocket = io(baseUrl, { auth: { token: memberAccess }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      memberSocket.once(WsEvents.Ready, resolve);
      memberSocket.once('auth_error', () => reject(new Error('WS-авторизация не прошла')));
    });
    const requestArrived = new Promise<{ direction: string; user: { username: string } }>(
      (resolve) => {
        memberSocket.once(WsEvents.FriendRequestNew, resolve);
      },
    );

    // Владелец отправляет заявку по имени (регистр не важен)
    const sent = await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ username: MEMBER.username.toUpperCase() })
      .expect(201);
    expect(sent.body.autoAccepted).toBe(false);

    const wsRequest = await requestArrived;
    expect(wsRequest.direction).toBe('incoming');
    expect(wsRequest.user.username).toBe(OWNER.username);
    memberSocket.disconnect();

    // Повторная заявка — 400; самому себе — 400
    await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ username: MEMBER.username })
      .expect(400);
    await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ username: OWNER.username })
      .expect(400);

    // У участника входящая заявка — принимает
    const requests = await request(httpServer)
      .get('/api/friends/requests')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    const incoming = (
      requests.body as { id: string; direction: string; user: { id: string } }[]
    ).find((r) => r.direction === 'incoming' && r.user.id === ownerId);
    expect(incoming).toBeDefined();
    await request(httpServer)
      .post(`/api/friends/requests/${incoming!.id}/accept`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);

    // Оба видят друг друга в друзьях
    const ownerFriends = await request(httpServer)
      .get('/api/friends')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect((ownerFriends.body as { id: string }[]).some((f) => f.id === memberId)).toBe(true);

    // Участник блокирует владельца: дружба исчезает, ЛС закрыты в обе стороны
    const conversation = await request(httpServer)
      .post('/api/dm/conversations')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ userId: memberId })
      .expect(201);
    await request(httpServer)
      .put(`/api/friends/blocked/${ownerId}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(204);

    const afterBlock = await request(httpServer)
      .get('/api/friends')
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    expect((afterBlock.body as { id: string }[]).some((f) => f.id === ownerId)).toBe(false);

    await request(httpServer)
      .post(`/api/dm/conversations/${conversation.body.id}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'не дойдёт' })
      .expect(403);
    await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ username: MEMBER.username })
      .expect(403);

    // Разблокировка возвращает возможность писать
    await request(httpServer)
      .delete(`/api/friends/blocked/${ownerId}`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(204);
    await request(httpServer)
      .post(`/api/dm/conversations/${conversation.body.id}/messages`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ content: 'снова на связи' })
      .expect(201);

    // Встречная заявка сразу становится дружбой
    await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ username: OWNER.username })
      .expect(201);
    const counter = await request(httpServer)
      .post('/api/friends/requests')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ username: MEMBER.username })
      .expect(201);
    expect(counter.body.autoAccepted).toBe(true);

    // Удаление из друзей
    await request(httpServer)
      .delete(`/api/friends/${memberId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    const finalFriends = await request(httpServer)
      .get('/api/friends')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect((finalFriends.body as { id: string }[]).some((f) => f.id === memberId)).toBe(false);
  });

  it('роли сервера: создание, выдача участнику, права; чужой без MANAGE_ROLES — 403', async () => {
    const memberMe = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAccess}`);
    const memberId = (memberMe.body as MeDto).id;

    // Владелец создаёт роль
    const created = await request(httpServer)
      .post(`/api/guilds/${guildId}/roles`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ name: 'VIP', color: '#ff7a45', permissions: Permissions.MENTION_EVERYONE })
      .expect(201);
    const roleId = created.body.id as string;

    const roles = await request(httpServer)
      .get(`/api/guilds/${guildId}/roles`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect((roles.body as { name: string }[]).some((r) => r.name === 'VIP')).toBe(true);

    // Участник без MANAGE_ROLES не может создавать роли
    await request(httpServer)
      .post(`/api/guilds/${guildId}/roles`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ name: 'Хакер', permissions: 0 })
      .expect(403);

    // Выдаём роль участнику — она появляется в его списке ролей на сервере
    await request(httpServer)
      .put(`/api/guilds/${guildId}/members/${memberId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    const members = await request(httpServer)
      .get(`/api/guilds/${guildId}/members`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    const member = (members.body as MemberDto[]).find((m) => m.id === memberId);
    expect(member?.roles.some((r) => r.name === 'VIP')).toBe(true);

    // Снятие роли
    await request(httpServer)
      .delete(`/api/guilds/${guildId}/members/${memberId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);

    // Роль «Владелец» удалить нельзя
    const ownerRole = (roles.body as { id: string; isOwnerRole: boolean }[]).find(
      (r) => r.isOwnerRole,
    );
    await request(httpServer)
      .delete(`/api/guilds/${guildId}/roles/${ownerRole!.id}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(403);

    // Профиль сервера: переименование владельцем
    const renamed = await request(httpServer)
      .patch(`/api/guilds/${guildId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ name: 'Voxa HQ' })
      .expect(200);
    expect(renamed.body.name).toBe('Voxa HQ');
    // Возвращаем имя
    await request(httpServer)
      .patch(`/api/guilds/${guildId}`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({ name: 'Voxa' })
      .expect(200);
  });

  it('мультисервер: создание сервера, инвайт, вступление и выход', async () => {
    // Участник создаёт собственный сервер и становится его владельцем
    const created = await request(httpServer)
      .post('/api/guilds')
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ name: 'Уютный уголок' })
      .expect(201);
    const newGuildId = created.body.id as string;
    expect(created.body.myPermissions & Permissions.ADMINISTRATOR).toBe(Permissions.ADMINISTRATOR);

    // Стартовая структура нового сервера создана
    const structure = await request(httpServer)
      .get(`/api/guilds/${newGuildId}/structure`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(200);
    const channels = (structure.body as CommunityStructureDto).categories.flatMap(
      (c) => c.channels,
    );
    expect(channels.some((c) => c.name === 'общий' && c.type === 'TEXT')).toBe(true);
    expect(channels.some((c) => c.type === 'VOICE')).toBe(true);

    // Чужому серверу структура не видна
    await request(httpServer)
      .get(`/api/guilds/${newGuildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(403);

    // Создатель зовёт владельца «Voxa» инвайтом — тот вступает
    const invite = await request(httpServer)
      .post(`/api/guilds/${newGuildId}/invites`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ maxUses: 5 })
      .expect(201);
    await request(httpServer)
      .post(`/api/invites/${invite.body.code}/join`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);

    const ownerGuilds = await request(httpServer)
      .get('/api/guilds')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect((ownerGuilds.body as { id: string }[]).some((g) => g.id === newGuildId)).toBe(true);
    await request(httpServer)
      .get(`/api/guilds/${newGuildId}/structure`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);

    // Владелец сервера не может его покинуть, обычный участник — может
    await request(httpServer)
      .post(`/api/guilds/${newGuildId}/leave`)
      .set('Authorization', `Bearer ${memberAccess}`)
      .expect(400);
    await request(httpServer)
      .post(`/api/guilds/${newGuildId}/leave`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(204);
    const afterLeave = await request(httpServer)
      .get('/api/guilds')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .expect(200);
    expect((afterLeave.body as { id: string }[]).some((g) => g.id === newGuildId)).toBe(false);

    // Родной сервер «Voxa» при этом остаётся на месте
    expect((afterLeave.body as { name: string }[]).some((g) => g.name === 'Voxa')).toBe(true);
  });
});
