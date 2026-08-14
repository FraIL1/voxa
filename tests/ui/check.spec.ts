import { expect, test } from './fixtures';

test('свой взгляд: вернулся на сервер во время звонка', async ({ owner }) => {
  await owner.locator('.rail-icon.server').first().click();
  await owner.waitForURL(/\/guilds\//);
  await owner.locator('.channel-link.voice-link').first().click();
  await expect(owner.locator('.voice-panel')).toBeVisible();
  console.warn('### в канале, себя вижу: ' + (await owner.locator('.voice-participant').count()));

  // Звоним другу
  await owner.locator('.rail-icon.home').click();
  await owner.getByRole('button', { name: 'Все', exact: true }).click();
  await owner.getByTitle('Написать').first().click();
  await owner.waitForURL(/\/dm\//);
  await owner.locator('.dm-header-actions').getByTitle('Голосовой звонок').click();
  await owner.waitForTimeout(1500);

  // ВОЗВРАЩАЕМСЯ НА СЕРВЕР, не кладя трубку — вот что делает пользователь
  await owner.locator('.rail-icon.server').first().click();
  await owner.waitForURL(/\/guilds\//);
  await owner.waitForTimeout(1200);
  console.warn(
    '### во время звонка на сервере, себя в канале вижу: ' +
      (await owner.locator('.voice-participant').count()),
  );
  console.warn(
    '### голосовой канал подсвечен активным: ' +
      (await owner.locator('.channel-link.voice-link.active').count()),
  );

  // Сбрасываем и смотрим снова
  await owner
    .locator('.call-dock-button.hangup, .call-controls [title="Завершить звонок"]')
    .first()
    .click();
  await owner.waitForTimeout(1500);
  console.warn(
    '### после сброса, себя в канале вижу: ' + (await owner.locator('.voice-participant').count()),
  );
});
