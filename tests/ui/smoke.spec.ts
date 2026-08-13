import { expect, test } from './fixtures';
import { FRIEND, OWNER } from './global-setup';

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

test.describe('Смена аккаунта', () => {
  /**
   * Вкладку никто не перезагружает: выход и вход идут внутри приложения.
   * Кэш ответов при этом обязан обнулиться, иначе новый пользователь видит
   * списки прошлого — так у владельца оставались чужие диалоги и друзья.
   */
  test('в той же вкладке не остаётся данных прошлого пользователя', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const signIn = async (user: { username: string; password: string }): Promise<void> => {
      await page.getByLabel('Имя пользователя').fill(user.username);
      await page.getByLabel('Пароль').fill(user.password);
      await page.getByRole('button', { name: 'Войти' }).click();
      await page.waitForURL(/\/(home|guilds)/, { timeout: 20_000 });
    };

    await page.goto('/login');
    await signIn(OWNER);
    await page.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(page.locator('.friend-row', { hasText: 'uitest_friend' })).toHaveCount(1);

    // Выход и вход другим аккаунтом — без перезагрузки страницы
    await page.locator('.user-card .avatar').first().click();
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await signIn(FRIEND);
    await page.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });

    // В списке друзей должен быть владелец, а не сам вошедший из старого кэша
    await page.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(page.locator('.friend-row', { hasText: 'uitest_owner' })).toHaveCount(1);
    await expect(page.locator('.friend-row', { hasText: 'uitest_friend' })).toHaveCount(0);

    await context.close();
  });
});

test.describe('Свои окна вместо системных', () => {
  test('удаление сообщения спрашивает в окне приложения', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    const text = `удалим это ${Date.now()}`;
    await owner.getByRole('textbox').last().fill(text);
    await owner.keyboard.press('Enter');
    const message = owner.locator('.message', { hasText: text });
    await expect(message).toBeVisible();

    await message.hover();
    await message.getByTitle('Удалить').click();

    // Окно наше: у него есть разметка и кнопки приложения
    const confirm = owner.locator('.confirm-modal');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('heading', { name: 'Удалить сообщение' })).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Отмена' })).toBeVisible();

    await confirm.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(owner.locator('.message', { hasText: text })).toHaveCount(0);
  });

  test('галочки и поля нарисованы приложением, а не системой', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.server-header').click();
    await owner.getByRole('button', { name: 'Настройки сервера' }).click();
    await owner.getByRole('button', { name: 'Роли' }).click();

    // Галочка: системную отрисовку заменили своей — иначе снятая была белой
    const box = owner.locator('.role-perm input[type=checkbox]').first();
    await expect(box).toBeVisible();
    const boxStyle = await box.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        appearance: cs.appearance,
        background: cs.backgroundColor,
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        minHeight: cs.minHeight,
        padding: cs.padding,
      };
    });
    expect(boxStyle.appearance).toBe('none');
    expect(boxStyle.size).toBe('16x16');
    expect(boxStyle.minHeight).toBe('0px');
    expect(boxStyle.padding).toBe('0px');
    // Снятая галочка — цвета панели, а не системного белого
    expect(boxStyle.background).toBe('rgb(22, 30, 45)');

    // Выбор цвета роли — без системной рамки вокруг образца
    const color = owner.locator('.role-color-input').first();
    await expect(color).toHaveCSS('appearance', 'none');

    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });

  test('выбор устройства — свой список, а не системный', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();

    // Системных select в приложении не осталось
    await expect(owner.locator('select')).toHaveCount(0);

    const trigger = owner.locator('.select-trigger').first();
    await trigger.click();
    await expect(owner.locator('.select-list')).toBeVisible();
    await expect(owner.locator('.select-option').first()).toBeVisible();

    // Escape закрывает список, но не окно настроек вокруг него
    await owner.keyboard.press('Escape');
    await expect(owner.locator('.select-list')).toBeHidden();
    await expect(owner.locator('.settings-panel')).toBeVisible();
  });
});

test.describe('Кликабельность', () => {
  test('строка друга открывает профиль, а кнопки внутри — свои действия', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    const row = owner.locator('.friend-row', { hasText: 'uitest_friend' }).first();
    await expect(row).toBeVisible();

    await row.click();
    const card = owner.locator('.profile-modal');
    await expect(card).toBeVisible();
    await expect(card.getByText('@uitest_friend')).toBeVisible();
    await owner.keyboard.press('Escape');
    await expect(card).toBeHidden();

    // Кнопка внутри строки профиль не открывает: у неё своё дело
    await row.getByTitle('Написать').click();
    await owner.waitForURL(/\/dm\//);
    await expect(owner.locator('.profile-modal')).toHaveCount(0);
  });

  test('имя собеседника в шапке диалога открывает профиль', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);

    await owner.locator('.dm-header-title').click();
    await expect(owner.locator('.profile-modal').getByText('@uitest_friend')).toBeVisible();
  });

  test('серверы в левом столбце можно перетаскивать', async ({ owner }) => {
    // Ждём список серверов: считать их сразу нельзя — он ещё грузится,
    // и сценарий молча пропускался вместо проверки
    const rail = owner.locator('.rail-icon.server');
    await expect(rail).toHaveCount(2);

    const before = await rail.evaluateAll((els) => els.map((el) => el.getAttribute('title')));
    await rail.first().dragTo(rail.nth(1));

    await expect
      .poll(() => rail.evaluateAll((els) => els.map((el) => el.getAttribute('title'))))
      .not.toEqual(before);

    // Порядок пережил перезагрузку — значит сохранился на сервере
    const after = await rail.evaluateAll((els) => els.map((el) => el.getAttribute('title')));
    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await expect
      .poll(() =>
        owner
          .locator('.rail-icon.server')
          .evaluateAll((e) => e.map((el) => el.getAttribute('title'))),
      )
      .toEqual(after);

    // Возвращаем прежний порядок: он общий для всего прогона
    await rail.first().dragTo(rail.nth(1));
    await expect
      .poll(() => rail.evaluateAll((els) => els.map((el) => el.getAttribute('title'))))
      .toEqual(before);
  });
});

test.describe('Звуки', () => {
  test('вход в голосовой канал действительно звучит и выключается', async ({ owner }) => {
    // Считаем запущенные источники звука: так видно, что синтез сработал
    await owner.addInitScript(() => {
      const w = window as unknown as { __notes: number };
      w.__notes = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args: [number?]) {
        w.__notes += 1;
        return start.apply(this, args);
      };
    });
    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });

    const notes = (): Promise<number> =>
      owner.evaluate(() => (window as unknown as { __notes: number }).__notes);

    // Кнопка «послушать» в настройках — самый короткий путь к звуку
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();
    const preview = owner.locator('.sound-toggle').getByTitle('Послушать');
    await preview.click();
    await expect.poll(notes).toBeGreaterThan(0);

    // Звук не просто синтезируется, а действительно идёт в динамики:
    // до жеста пользователя браузер держит вывод на паузе
    const state = await owner.evaluate(async () => {
      const probe = new AudioContext();
      const value = probe.state;
      await probe.close();
      return value;
    });
    expect(state).toBe('running');

    // Выключатель гасит звуки целиком, и выбор переживает перезагрузку
    const played = await notes();
    await owner.locator('.sound-toggle .owner-switch input').setChecked(false);
    await expect(preview).toBeDisabled();
    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();
    await expect(owner.locator('.sound-toggle .owner-switch input')).not.toBeChecked();
    expect(await notes()).toBeLessThanOrEqual(played);

    // Возвращаем звуки, чтобы следующий сценарий начинал с обычного состояния
    await owner.locator('.sound-toggle .owner-switch input').setChecked(true);
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });
});

test.describe('Панель владельца', () => {
  test('разделы переключаются, сводка и списки видны', async ({ owner }) => {
    await owner.locator('.rail-icon.owner').click();
    const panel = owner.locator('.owner-panel');
    await expect(panel).toBeVisible();

    // Обзор: плитки со сводкой, «сейчас онлайн» выделена
    await expect(panel.locator('.admin-tile')).toHaveCount(9);
    await expect(panel.locator('.admin-tile.accent')).toHaveCount(1);
    await expect(panel.locator('.admin-tile-icon').first()).toBeVisible();

    // Кнопки разделов оформлены, а не серые системные
    const tab = panel.getByRole('button', { name: 'Пользователи' });
    const tabBg = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tabBg).toBe('rgba(0, 0, 0, 0)');

    await tab.click();
    await expect(panel.getByPlaceholder('Поиск по логину или имени')).toBeVisible();
    await expect(panel.getByText('uitest_friend').first()).toBeVisible();

    await panel.getByRole('button', { name: 'Серверы' }).click();
    await expect(panel.getByRole('heading', { name: 'Серверы' })).toBeVisible();

    await panel.getByRole('button', { name: 'Хранилище' }).click();
    await expect(panel.locator('.admin-tile')).toHaveCount(3);

    await panel.getByTitle('Закрыть').click();
    await expect(panel).toBeHidden();
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

test.describe('Синхрон присутствия', () => {
  test('смена статуса сразу видна и в карточке, и в списке участников', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    const meInList = owner.locator('.member', { hasText: 'uitest_owner' }).first();
    await expect(meInList.locator('.status-dot')).toHaveClass(/online/);

    // Ставим «не беспокоить» через меню профиля внизу слева
    await owner.locator('.user-card-identity').click();
    const menu = owner.locator('.profile-menu');
    await menu.locator('.menu-sub .menu-item').first().click();
    await menu.locator('.status-menu-item', { hasText: 'Не беспокоить' }).click();

    // Обе части интерфейса должны показать новый статус без перезагрузки
    await expect(owner.locator('.user-card-status')).toHaveText('Не беспокоить');
    await expect(meInList.locator('.status-dot')).toHaveClass(/dnd/);

    // Возвращаем обычный режим
    await owner.locator('.user-card-identity').click();
    await menu.locator('.menu-sub .menu-item').first().click();
    await menu.locator('.status-menu-item', { hasText: 'В сети' }).click();
    await expect(meInList.locator('.status-dot')).toHaveClass(/online/);
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

    // Круглые кнопки не должны сжиматься до размера обычной иконки:
    // общий .icon-button однажды уже зажал их и иконки полезли за края
    const controlBox = await stage.locator('.call-control').first().boundingBox();
    expect(controlBox!.width).toBeGreaterThanOrEqual(44);
    expect(controlBox!.height).toBeGreaterThanOrEqual(44);

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
