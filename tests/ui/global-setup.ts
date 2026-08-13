import { PrismaClient } from '@prisma/client';
import type { FullConfig } from '@playwright/test';

import { API_URL, TEST_DB_URL } from '../../playwright.config';

/** Учётные записи стенда: владелец приложения и обычный участник */
export const OWNER = { username: 'uitest_owner', password: 'ui-test-password-owner-1' };
export const FRIEND = { username: 'uitest_friend', password: 'ui-test-password-friend-1' };

interface RegisterResult {
  accessToken: string;
  user: { id: string };
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * Готовит чистый стенд: два аккаунта, общий сервер и дружба между ними —
 * чтобы сценарии могли сразу проверять личку, звонки и каналы.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  try {
    // Стенд пересоздаётся начисто: удаляем прежние тестовые аккаунты
    await prisma.user.deleteMany({
      where: { usernameLower: { in: [OWNER.username, FRIEND.username] } },
    });

    // Код регистрации: bootstrap выдаёт сид, иначе делаем свой
    let invite = await prisma.registrationInvite.findFirst({
      where: { revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    invite ??= await prisma.registrationInvite.create({
      data: { code: `ui-test-${Date.now()}`, maxUses: null },
    });

    const owner = await api<RegisterResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: invite.code, ...OWNER }),
    });

    // Владелец приложения — тот, кто зарегистрировался первым; на стенде
    // это может быть не наш аккаунт, поэтому проставляем флаг явно
    await prisma.user.update({
      where: { id: owner.user.id },
      data: { isInstanceOwner: true },
    });

    const friendCode = await api<{ code: string }>('/instance/registration-invites', {
      method: 'POST',
      token: owner.accessToken,
      body: JSON.stringify({ maxUses: 5 }),
    });
    const friend = await api<RegisterResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: friendCode.code, ...FRIEND }),
    });

    // Общий сервер: владелец зовёт друга серверным инвайтом
    const guilds = await api<{ id: string }[]>('/guilds', { token: owner.accessToken });
    const guild =
      guilds[0] ??
      (await api<{ id: string }>('/guilds', {
        method: 'POST',
        token: owner.accessToken,
        body: JSON.stringify({ name: 'Тестовый сервер' }),
      }));
    const serverInvite = await api<{ code: string }>(`/guilds/${guild.id}/invites`, {
      method: 'POST',
      token: owner.accessToken,
      body: JSON.stringify({ maxUses: 10 }),
    });
    await api(`/invites/${serverInvite.code}/join`, {
      method: 'POST',
      token: friend.accessToken,
    });

    // Второй сервер владельца — на нём проверяется перетаскивание в столбце
    if (guilds.length < 2) {
      await api('/guilds', {
        method: 'POST',
        token: owner.accessToken,
        body: JSON.stringify({ name: 'Второй сервер' }),
      });
    }

    // Дружба: заявка и встречная заявка сразу дают принятую дружбу
    await api('/friends/requests', {
      method: 'POST',
      token: owner.accessToken,
      body: JSON.stringify({ username: FRIEND.username }),
    });
    await api('/friends/requests', {
      method: 'POST',
      token: friend.accessToken,
      body: JSON.stringify({ username: OWNER.username }),
    });
  } finally {
    await prisma.$disconnect();
  }
}
