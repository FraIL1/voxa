import { test as base, type Browser, type Page } from '@playwright/test';

import { FRIEND, OWNER } from './global-setup';

/**
 * Вход выполняется один раз на воркер и контекст живёт до конца прогона.
 * Так задумано: сохранённый storageState не подходит (refresh-токен
 * одноразовый), а логиниться в каждом тесте нельзя — вход намеренно
 * ограничен пятью попытками в минуту, и суите этого не хватает.
 */
async function signedInPage(
  browser: Browser,
  user: { username: string; password: string },
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Логин').fill(user.username);
  await page.getByLabel('Пароль', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/(home|guilds)/, { timeout: 20_000 });
  return page;
}

/**
 * Открывает домашний экран и ждёт, пока приложение действительно готово:
 * пока идёт проверка входа, показывается заставка и горячие клавиши ещё
 * не работают — сценарии не должны стартовать в этот момент.
 */
async function openHome(page: Page): Promise<void> {
  await page.goto('/home');
  await page.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
}

interface WorkerPages {
  ownerSession: Page;
  friendSession: Page;
}

/**
 * owner — владелец стенда, friend — второй участник. Каждый тест получает
 * страницу на домашнем экране: состояние прошлого сценария не тянется.
 */
export const test = base.extend<{ owner: Page; friend: Page }, WorkerPages>({
  ownerSession: [
    async ({ browser }, use) => {
      const page = await signedInPage(browser, OWNER);
      await use(page);
      await page.context().close();
    },
    { scope: 'worker' },
  ],

  friendSession: [
    async ({ browser }, use) => {
      const page = await signedInPage(browser, FRIEND);
      await use(page);
      await page.context().close();
    },
    { scope: 'worker' },
  ],

  owner: async ({ ownerSession }, use) => {
    await openHome(ownerSession);
    await use(ownerSession);
  },

  friend: async ({ friendSession }, use) => {
    await openHome(friendSession);
    await use(friendSession);
  },
});

export { expect } from '@playwright/test';
