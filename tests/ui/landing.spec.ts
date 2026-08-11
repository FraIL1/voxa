import { expect, test } from '@playwright/test';

/** Витрина открыта гостю: вход для неё не нужен */
test.describe('Приветственная страница', () => {
  test('гость видит рассказ о проекте и обе кнопки', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Голос');
    await expect(page.getByRole('link', { name: /Скачать для Windows/ }).first()).toBeVisible();
    await expect(page.locator('#features')).toBeAttached();
    await expect(page.locator('#voice')).toBeAttached();
    await expect(page.locator('#own')).toBeAttached();
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

  test('блоки проявляются при прокрутке', async ({ page }) => {
    await page.goto('/');
    const features = page.locator('#features .reveal').first();
    await features.scrollIntoViewIfNeeded();
    await expect(features).toHaveClass(/shown/);
  });
});
