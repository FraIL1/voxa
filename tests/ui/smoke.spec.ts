import { expect, test } from './fixtures';

test.describe('Базовый обход интерфейса', () => {
  test('вход открывает домашний экран с друзьями и списком серверов', async ({ owner }) => {
    await expect(owner.locator('.server-rail')).toBeVisible();

    // Друг из подготовки стенда виден во вкладке «Все»
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(owner.getByText('uitest_friend').first()).toBeVisible();
  });

  test('личный диалог: сообщение уходит и остаётся в ленте', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);

    const text = `привет из теста ${Date.now()}`;
    await owner.getByRole('textbox').last().fill(text);
    await owner.keyboard.press('Enter');
    await expect(owner.getByText(text)).toBeVisible();
  });

  test('канал сервера принимает сообщение', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    const text = `сообщение в канал ${Date.now()}`;
    await owner.getByRole('textbox').last().fill(text);
    await owner.keyboard.press('Enter');
    await expect(owner.getByText(text)).toBeVisible();
  });

  test('второй участник видит общий сервер и владельца в списке', async ({ friend }) => {
    await friend.locator('.rail-icon.server').first().click();
    await friend.waitForURL(/\/guilds\//);
    await expect(friend.getByText('uitest_owner').first()).toBeVisible();
  });
});

test.describe('Карточка профиля', () => {
  test('клик по участнику открывает профиль с @логином и общим сервером', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    await owner.locator('.member', { hasText: 'uitest_friend' }).first().click();

    const card = owner.locator('.profile-modal');
    await expect(card).toBeVisible();
    await expect(card.getByText('@uitest_friend')).toBeVisible();
    // Дата регистрации и общий сервер — то, ради чего карточку и открывают
    await expect(card.getByText('В Voxa с')).toBeVisible();
    await expect(card.getByText('Общие серверы', { exact: false })).toBeVisible();
    // Друзья по подготовке стенда — значит есть и метка, и кнопка удаления
    await expect(card.getByText('Друг', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Написать' })).toBeVisible();
  });
});

test.describe('Профиль в личке', () => {
  test('открывается колонкой справа, а не полосой во всю ширину', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);

    await owner.locator('.dm-header-actions').getByTitle('Профиль').click();
    const aside = owner.locator('.dm-profile-aside');
    await expect(aside).toBeVisible();
    await expect(aside.getByText('@uitest_friend')).toBeVisible();

    // Колонка узкая и стоит справа от переписки
    const asideBox = await aside.boundingBox();
    const viewport = owner.viewportSize();
    expect(asideBox && viewport).toBeTruthy();
    expect(asideBox!.width).toBeLessThan(420);
    expect(asideBox!.x).toBeGreaterThan(viewport!.width / 2);

    // Лента остаётся видимой рядом
    await expect(owner.locator('.dm-main .composer')).toBeVisible();
    await aside.getByTitle('Закрыть').click();
    await expect(aside).toBeHidden();
  });
});

test.describe('Оформление', () => {
  test('светлая тема переключается и запоминается', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();
    await owner.getByRole('button', { name: 'Светлая' }).click();

    await expect(owner.locator('html')).toHaveAttribute('data-theme', 'light');
    // Фон страницы действительно светлый, а не только атрибут
    const bg = await owner.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(238, 241, 247)');

    // Перезагрузка сохраняет выбор
    await owner.reload();
    await expect(owner.locator('html')).toHaveAttribute('data-theme', 'light');

    // Возвращаем тёмную, чтобы следующий тест начинал с обычного вида
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();
    await owner.getByRole('button', { name: 'Тёмная' }).click();
    await expect(owner.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('Присутствие', () => {
  test('меню профиля меняет режим и подпись под ником', async ({ owner }) => {
    await owner.locator('.user-card-identity').click();
    const menu = owner.locator('.profile-menu');
    await expect(menu).toBeVisible();
    // Шапка меню показывает, кто я
    await expect(menu.getByText('@uitest_owner')).toBeVisible();

    // Статус — подменю: раскрываем и выбираем
    await menu.locator('.menu-sub .menu-item').first().click();
    const sub = menu.locator('.menu-sub-list');
    const subBox = await sub.boundingBox();
    const viewport = owner.viewportSize();
    expect(subBox && viewport).toBeTruthy();
    expect(subBox!.y + subBox!.height).toBeLessThanOrEqual(viewport!.height);

    await menu.locator('.status-menu-item', { hasText: 'Не беспокоить' }).click();
    await expect(owner.locator('.user-card-status')).toHaveText('Не беспокоить');
    await expect(owner.locator('.me-avatar')).toHaveClass(/dot-dnd/);

    // Возвращаем обычный режим, чтобы не влиять на другие сценарии
    await owner.locator('.user-card-identity').click();
    await menu.locator('.menu-sub .menu-item').first().click();
    await menu.locator('.status-menu-item', { hasText: 'В сети' }).click();
    await expect(owner.locator('.user-card-status')).toHaveText('В сети');
  });

  test('правый клик по диалогу открывает меню действий', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);

    await owner.locator('.dm-link').first().click({ button: 'right' });
    const menu = owner.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Профиль', { exact: true })).toBeVisible();
    await expect(menu.getByText('Начать звонок')).toBeVisible();
    await expect(menu.getByText('Добавить заметку')).toBeVisible();
    await expect(menu.getByText('Закрыть диалог')).toBeVisible();

    // Подменю сроков заглушения раскрывается
    await menu.locator('.menu-sub .menu-item').first().click();
    await expect(menu.getByText('Пока не включу')).toBeVisible();
    await owner.keyboard.press('Escape');
  });

  test('меню участника сервера: профиль, упоминание, роли', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    await owner.locator('.member', { hasText: 'uitest_friend' }).first().click({ button: 'right' });
    const menu = owner.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Упомянуть')).toBeVisible();
    await expect(menu.getByText('Роли')).toBeVisible();

    // Упоминание попадает в поле ввода
    await menu.getByText('Упомянуть').click();
    await expect(owner.locator('.composer textarea')).toHaveValue(/@uitest_friend/);
  });
});

test.describe('Меню сервера', () => {
  test('выпадающее меню держится внутри боковой панели', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    await owner.locator('.server-header').click();
    const dropdown = owner.locator('.server-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByText('Настройки сервера')).toBeVisible();

    // Меню не должно вылезать за боковую панель — раньше растягивалось на экран
    const menuBox = await dropdown.boundingBox();
    const sidebarBox = await owner.locator('.sidebar').boundingBox();
    expect(menuBox && sidebarBox).toBeTruthy();
    expect(menuBox!.width).toBeLessThanOrEqual(sidebarBox!.width);
    expect(menuBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x - 1);
  });
});

test.describe('Быстрый переход', () => {
  test('Ctrl+K находит сервер и переводит на него', async ({ owner }) => {
    await owner.keyboard.press('Control+k');
    await expect(owner.locator('.switcher')).toBeVisible();

    await owner.getByPlaceholder('Куда перейти').fill('uitest_friend');
    await expect(owner.locator('.switcher-row').first()).toBeVisible();
    await owner.keyboard.press('Enter');
    await owner.waitForURL(/\/dm\//);
  });
});

test.describe('Звонок в личных сообщениях', () => {
  test('микрофон синхронен между экраном звонка и карточкой пользователя', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);

    await owner.getByTitle('Голосовой звонок').click();

    // Экран звонка: аватар, имя собеседника и круглые кнопки управления
    const stage = owner.locator('.call-stage');
    await expect(stage).toBeVisible();
    await expect(stage.locator('.call-avatar')).toBeVisible();
    await expect(stage.locator('.call-control')).toHaveCount(4);

    const stageMic = stage.getByTitle('Выключить микрофон');
    const cardMic = owner.locator('.user-card').getByTitle('Выключить микрофон');
    await expect(cardMic).toBeEnabled();

    // Мьют с экрана звонка — карточка внизу подхватывает состояние
    await stageMic.click();
    await expect(stage.getByTitle('Включить микрофон')).toHaveClass(/engaged/);
    await expect(owner.locator('.user-card').getByTitle('Включить микрофон')).toHaveClass(
      /engaged/,
    );

    // И обратно: размьют из карточки снимает мьют на экране звонка
    await owner.locator('.user-card').getByTitle('Включить микрофон').click();
    // Кнопка снова называется «выключить» — значит микрофон включён
    await expect(stage.getByTitle('Выключить микрофон')).toBeVisible();

    // Наушники тоже общие — и выключают микрофон, как в голосовых каналах
    await owner.locator('.user-card').getByTitle('Выключить звук').click();
    await expect(stage.getByTitle('Включить звук')).toHaveClass(/engaged/);
    await expect(stage.getByTitle('Включить микрофон')).toHaveClass(/engaged/);

    await stage.getByTitle('Завершить звонок').click();
    await expect(stage).toBeHidden();
  });
});
