import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  API_PREFIX,
  Permissions,
  WsEvents,
  type AuthResponseDto,
  type CommunityStructureDto,
  type MessageDto,
  type MessagesPageDto,
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
    expect(body.user.roles.map((r) => r.name)).toContain('Владелец');
    expect(body.user.permissions & Permissions.ADMINISTRATOR).toBe(Permissions.ADMINISTRATOR);

    ownerAccess = body.accessToken;
    ownerRefreshCookie = refreshCookieOf(res);
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

  it('ротация refresh-токена и детекция повторного использования', async () => {
    // Ротация: старый cookie обменивается на новый
    const rotated = await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', ownerRefreshCookie)
      .expect(200);
    const newCookie = refreshCookieOf(rotated);
    expect(newCookie).not.toBe(ownerRefreshCookie);

    // Повторное использование старого токена — признак кражи
    await request(httpServer)
      .post('/api/auth/refresh')
      .set('Cookie', ownerRefreshCookie)
      .expect(401);

    // Всё семейство отозвано, новый токен тоже недействителен
    await request(httpServer).post('/api/auth/refresh').set('Cookie', newCookie).expect(401);

    // Перелогин восстанавливает доступ
    const relogin = await request(httpServer).post('/api/auth/login').send(OWNER).expect(200);
    ownerAccess = (relogin.body as AuthResponseDto).accessToken;
    ownerRefreshCookie = refreshCookieOf(relogin);
  });

  it('владелец создаёт обычный инвайт, по нему регистрируется участник', async () => {
    const created = await request(httpServer)
      .post('/api/invites')
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
    expect(body.user.roles.map((r) => r.name)).toEqual(['Участник']);
    memberAccess = body.accessToken;
  });

  it('участник без права «Управление каналами» получает 403', async () => {
    await request(httpServer)
      .post('/api/channels')
      .set('Authorization', `Bearer ${memberAccess}`)
      .send({ name: 'хакерский', type: 'TEXT' })
      .expect(403);
  });

  it('структура сообщества доступна и содержит #общий', async () => {
    const res = await request(httpServer)
      .get('/api/channels')
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
    await request(httpServer).get('/api/channels').expect(401);
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
      .get('/api/channels')
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
});
