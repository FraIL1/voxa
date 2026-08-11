import { expect, test } from '@playwright/test';

/** Витрина открыта гостю: вход для неё не нужен */
test.describe('Приветственная страница', () => {
  test('гость видит рассказ о проекте и обе кнопки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Голос');
    // Кнопка скачивания — ссылка, если адрес сборки задан, иначе обычная кнопка
    await expect(page.getByText('Скачать для Windows').first()).toBeVisible();
    await expect(page.locator('#features')).toBeAttached();
    await expect(page.locator('#voice')).toBeAttached();
    await expect(page.locator('#steps')).toBeAttached();
    await expect(page.locator('#faq')).toBeAttached();
  });

  test('в подвале указаны права и нет ссылок на исходники', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-footer')).toContainText('Все права защищены');

    // Проект закрытый: ссылок на репозитории на витрине быть не должно
    const links = await page
      .locator('a[href]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href.toLowerCase()));
    expect(links.some((href) => href.includes('github') || href.includes('gitlab'))).toBe(false);
  });

  test('логотипы сверху и снизу ведут на главную и стоят на одной вертикали', async ({ page }) => {
    await page.goto('/');
    const header = await page.locator('.lp-header .lp-logo').boundingBox();
    await page.locator('.lp-footer').scrollIntoViewIfNeeded();
    const footer = await page.locator('.lp-footer .lp-logo').boundingBox();
    expect(Math.abs(header!.x - footer!.x)).toBeLessThanOrEqual(1);

    // Со страницы входа можно вернуться на главную
    await page.goto('/login');
    await page.locator('.auth-home').click();
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
    const features = page.locator('#features .reveal').first();
    await features.scrollIntoViewIfNeeded();
    await expect(features).toHaveClass(/shown/);

    const faq = page.locator('.lp-faq').first();
    await faq.scrollIntoViewIfNeeded();
    await faq.getByRole('button').click();
    await expect(faq).toHaveClass(/open/);
  });
});
