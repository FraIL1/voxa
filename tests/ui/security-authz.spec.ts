import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { Permissions } from '@voxa/shared';

import { API_URL, TEST_DB_URL } from '../../playwright.config';
import { FRIEND, OWNER } from './global-setup';

/** Вход по API: сценариям здесь браузер не нужен, проверяем сам сервер */
async function login(user: { username: string; password: string }): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function register(prisma: PrismaClient): Promise<{ id: string; username: string }> {
  const username = `uitest_a_${Math.random().toString(36).slice(2, 8)}`;
  const invite = await prisma.registrationInvite.create({
    data: { code: `ui-authz-${Math.random().toString(36).slice(2, 10)}`, maxUses: null },
  });
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode: invite.code, username, password: 'ui-test-authz-pass-1' }),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, username };
}

test.describe('Права и старшинство', () => {
  test('модератор не может выгнать равного или старшего по ролям', async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

    try {
      const ownerUser = await prisma.user.findFirstOrThrow({
        where: { usernameLower: OWNER.username },
      });
      const friendUser = await prisma.user.findFirstOrThrow({
        where: { usernameLower: FRIEND.username },
      });
      const guild = await prisma.guild.findFirstOrThrow({
        where: { ownerId: ownerUser.id },
        orderBy: { createdAt: 'asc' },
      });

      // Друг — младший модератор с правом кика (позиция 10)
      const suffix = Math.random().toString(36).slice(2, 8);
      const junior = await prisma.role.create({
        data: {
          guildId: guild.id,
          name: `младший-${suffix}`,
          permissions: Permissions.KICK_MEMBERS,
          position: 10,
        },
      });
      const senior = await prisma.role.create({
        data: { guildId: guild.id, name: `старший-${suffix}`, permissions: 0, position: 50 },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: friendUser.id, roleId: junior.id } },
        create: { userId: friendUser.id, roleId: junior.id },
        update: {},
      });

      // Двое новичков на сервере: один старше друга, второй без ролей
      const above = await register(prisma);
      const plain = await register(prisma);
      for (const person of [above, plain]) {
        await prisma.guildMember.create({ data: { guildId: guild.id, userId: person.id } });
      }
      await prisma.userRole.create({ data: { userId: above.id, roleId: senior.id } });

      const token = await login(FRIEND);
      const kick = (userId: string): Promise<Response> =>
        fetch(`${API_URL}/api/guilds/${guild.id}/members/${userId}/kick`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: '{}',
        });

      // Старшего — нельзя
      const denied = await kick(above.id);
      expect(denied.status).toBe(403);
      expect(
        await prisma.guildMember.count({ where: { guildId: guild.id, userId: above.id } }),
      ).toBe(1);

      // Обычного участника — можно: право кика никуда не делось
      const allowed = await kick(plain.id);
      expect(allowed.ok, await allowed.clone().text()).toBe(true);
      expect(
        await prisma.guildMember.count({ where: { guildId: guild.id, userId: plain.id } }),
      ).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  /* Сводка по всему приложению — дело владельца приложения, а не любого,
     кто завёл себе сервер. Отдельный /admin/overview с такой проверкой
     удалён совсем; живая сводка живёт здесь. */
  test('сводка по приложению закрыта для всех, кроме владельца приложения', async () => {
    const asFriend = await login(FRIEND);
    const denied = await fetch(`${API_URL}/api/instance/overview`, {
      headers: { authorization: `Bearer ${asFriend}` },
    });
    expect(denied.status).toBe(403);

    const asOwner = await login(OWNER);
    const allowed = await fetch(`${API_URL}/api/instance/overview`, {
      headers: { authorization: `Bearer ${asOwner}` },
    });
    expect(allowed.ok, await allowed.clone().text()).toBe(true);
  });
});
