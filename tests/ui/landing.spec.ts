import { expect, test } from '@playwright/test';

/** Витрина открыта гостю: вход для неё не нужен */
test.describe('Приветственная страница', () => {
  test('гость видит рассказ о проекте и обе кнопки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/голос/i);
    // Кнопка скачивания — ссылка, если адрес сборки задан, иначе обычная кнопка
    await expect(page.getByText('Скачать для Windows').first()).toBeVisible();
    await expect(page.locator('#zashita')).toBeAttached();
    await expect(page.locator('#vnutri')).toBeAttached();
    await expect(page.locator('#kak-nachat')).toBeAttached();
    await expect(page.locator('#voprosy')).toBeAttached();
  });

  test('в подвале указаны права и нет ссылок на исходники', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-foot')).toContainText('Все права защищены');

    // Проект закрытый: ссылок на репозитории на витрине быть не должно
    const links = await page
      .locator('a[href]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href.toLowerCase()));
    expect(links.some((href) => href.includes('github') || href.includes('gitlab'))).toBe(false);
  });

  test('логотипы сверху и снизу ведут на главную и стоят на одной вертикали', async ({ page }) => {
    await page.goto('/');
    const header = await page.locator('.lp-hdr .lp-logo').boundingBox();
    await page.locator('.lp-foot').scrollIntoViewIfNeeded();
    const footer = await page.locator('.lp-foot .lp-logo').boundingBox();
    expect(Math.abs(header!.x - footer!.x)).toBeLessThanOrEqual(1);

    // Со страницы входа можно вернуться на главную
    await page.goto('/login');
    await page.locator('.auth-brand').click();
    await page.waitForURL((url) => url.pathname === '/');
  });

  test('кнопка «Открыть в браузере» ведёт на вход', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: /Открыть в браузере/ })
      .first()
      .click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
  });

  test('блоки проявляются при прокрутке, вопросы раскрываются', async ({ page }) => {
    await page.goto('/');
    const features = page.locator('#vnutri .lp-rv').first();
    await features.scrollIntoViewIfNeeded();
    await expect(features).toHaveClass(/\bin\b/);

    // Первый вопрос раскрыт сразу, чтобы было видно, что раздел разворачивается,
    // — проверяем на втором
    const question = page.locator('.lp-q').nth(1);
    await question.scrollIntoViewIfNeeded();
    await question.getByRole('button').click();
    await expect(question).toHaveClass(/open/);
  });
});

test.describe('Экран запуска', () => {
  test('заставка показывается, пока проверяется вход, и уходит после', async ({ page }) => {
    // На живом сервере проверка занимает миллисекунды — притормаживаем её
    await page.route('**/api/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await page.goto('/login');
    const splash = page.locator('.splash');
    await expect(splash).toBeVisible();
    await expect(splash.locator('.splash-wave span')).toHaveCount(5);

    // Как только вход проверен, заставка сменяется формой
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible({ timeout: 10_000 });
    await expect(splash).toBeHidden();
  });
});
