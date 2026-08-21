import { expect, test } from './fixtures';

/**
 * Друг зашёл в голосовой — это видно в личных и в списке друзей, и по нажатию
 * попадаешь прямо в тот канал, не обходя общие серверы.
 */
test.describe('В голосовом', () => {
  test('видно в личных и уводит прямо в канал', async ({ owner, friend }) => {
    // Друг заходит в голосовой на общем сервере
    await friend.locator('.rail-icon.server').first().click();
    await friend.waitForURL(/\/guilds\//);
    await friend.locator('.channel-link.voice-link').first().click();
    await expect(friend.locator('.voice-panel')).toBeVisible();

    // Владелец открывает личные — под ником друга вместо «в сети» голосовой
    await owner.goto('/home');
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    const row = owner.locator('.dm-link', { hasText: 'uitest_friend' });
    // Диалога может не быть — тогда проверяем в списке друзей
    if ((await row.count()) === 0) {
      await owner.getByRole('button', { name: 'Все', exact: true }).click();
      const friendRow = owner.locator('.friend-row', { hasText: 'uitest_friend' });
      await expect(friendRow.locator('.friend-in-voice')).toHaveText(/В голосовом/, {
        timeout: 10_000,
      });
      await friendRow.locator('.friend-in-voice').click();
    } else {
      await expect(row.locator('.dm-in-voice')).toHaveText(/В голосовом/, { timeout: 10_000 });
      await row.locator('.dm-in-voice').click();
    }

    // Попали в тот самый голосовой канал, а не в переписку
    await owner.waitForURL(/\/guilds\/[^/]+\/channels\//, { timeout: 10_000 });
    await expect(owner.locator('.voice-controls')).toBeVisible();
    await expect(
      owner
        .locator('.voice-tile', { hasText: 'uitest_friend' })
        .or(owner.locator('.voice-participant', { hasText: 'uitest_friend' })),
    ).not.toHaveCount(0);

    // Друг вышел — подпись пропала
    await friend.locator('.voice-panel-button.leave').click();
    await owner.goto('/home');
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(
      owner.locator('.friend-row', { hasText: 'uitest_friend' }).locator('.friend-in-voice'),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
