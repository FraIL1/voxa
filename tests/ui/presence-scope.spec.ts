import { PrismaClient } from '@prisma/client';

import { API_URL, TEST_DB_URL } from '../../playwright.config';
import { expect, test } from './fixtures';
import { OWNER } from './global-setup';

/**
 * Присутствие и смена профиля рассылаются только тем, кто человека знает:
 * соседям по серверам, друзьям и собеседникам в личке. Посторонний не должен
 * узнать ни статус, ни логин.
 *
 * Проверяем на уровне сокета: смотрим, какие кадры вообще приходят чужаку.
 */
test('присутствие не доходит до постороннего, а другу доходит', async ({
  owner,
  friend,
  browser,
}) => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  try {
    const ownerUser = await prisma.user.findFirstOrThrow({
      where: { usernameLower: OWNER.username },
    });

    // Заводим третий аккаунт: ни друзей, ни общих серверов
    // Логин короткий (есть предел длины) и случайный, чтобы соседние
    // прогоны не наткнулись друг на друга
    const stranger = {
      username: `uitest_gost_${Math.random().toString(36).slice(2, 9)}`,
      password: 'ui-test-password-stranger-1',
    };
    const invite = await prisma.registrationInvite.create({
      data: { code: `ui-test-stranger-${Date.now()}`, maxUses: null },
    });
    const registered = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: invite.code, ...stranger }),
    });
    expect(registered.ok, await registered.clone().text()).toBe(true);

    // Собираем всё, что приходит чужаку по сокету
    const context = await browser.newContext();
    const page = await context.newPage();
    const frames: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => frames.push(frame.payload.toString()));
    });
    await page.goto('/login');
    await page.getByLabel('Логин').fill(stranger.username);
    await page.getByLabel('Пароль', { exact: true }).fill(stranger.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/(home|guilds)/, { timeout: 20_000 });
    await page.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });

    // Друг смотрит список друзей: там статус владельца обновляется вживую
    await friend.getByRole('button', { name: 'В сети', exact: true }).click();

    frames.length = 0;

    // Владелец меняет режим — это и есть рассылка присутствия
    const setMode = async (label: string): Promise<void> => {
      await owner.locator('.user-card-identity').click();
      const menu = owner.locator('.profile-menu');
      await menu.locator('.menu-sub .menu-item').first().click();
      await menu.locator('.status-menu-item', { hasText: label }).click();
    };
    await setMode('Не беспокоить');

    // Друг видит смену — значит рассылка вообще работает
    await expect(
      friend.locator('.friend-row', { hasText: 'uitest_owner' }).locator('.status-dot'),
    ).toHaveClass(/dnd/, { timeout: 10_000 });

    // А посторонний про владельца не услышал ничего
    const aboutOwner = frames.filter((f) => f.includes(ownerUser.id));
    expect(aboutOwner).toEqual([]);
    const anyPresence = frames.filter((f) => f.includes('presence.update'));
    expect(anyPresence).toEqual([]);

    // Логин владельца тоже не должен всплыть у постороннего
    expect(frames.filter((f) => f.includes(OWNER.username))).toEqual([]);

    await setMode('В сети');
    await context.close();
  } finally {
    await prisma.$disconnect();
  }
});
