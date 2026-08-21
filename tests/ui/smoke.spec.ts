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
    // Дата регистрации и общие серверы — то, ради чего карточку и открывают.
    // Обе величины стоят плитками: крупное значение и подпись под ним.
    await expect(card.locator('.profile-stat')).toHaveCount(2);
    await expect(card.getByText('Общих серверов')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Общие серверы' })).toBeVisible();
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
    // Фон действительно светлый, а не только атрибут. Точный цвет не
    // проверяем: он свой у каждого облика, а светлота общая
    const bright = await owner.evaluate(() => {
      const parts = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number);
      const [r, g, b] = parts as [number, number, number];
      return r * 0.299 + g * 0.587 + b * 0.114;
    });
    expect(bright).toBeGreaterThan(140);

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
      await page.getByLabel('Логин').fill(user.username);
      await page.getByLabel('Пароль', { exact: true }).fill(user.password);
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

    /* У владельца прав не выбирают — там стоит подпись «все права», поэтому
       берём обычную роль. */
    await owner.locator('.roles-item', { hasText: 'Участник' }).first().click();

    /* Права — переключатели: системный флажок спрятан, а видимую дорожку
       рисуем сами. Проверяем, что системная отрисовка действительно не
       участвует, иначе снятый флажок был бы белым квадратом. */
    const perm = owner.locator('.role-perm .perm-switch').first();
    await expect(perm).toBeVisible();
    const permStyle = await perm.evaluate((el) => {
      const input = el.querySelector('input') as HTMLInputElement;
      const track = el.querySelector('.owner-switch-track') as HTMLElement;
      const trackBox = track.getBoundingClientRect();
      // Эталон берём из того же токена: цвет свой у каждого облика
      const probe = document.createElement('div');
      probe.style.background = 'var(--panel-hover)';
      document.body.appendChild(probe);
      const hover = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        inputOpacity: getComputedStyle(input).opacity,
        checked: input.checked,
        trackBackground: getComputedStyle(track).backgroundColor,
        hover,
        trackSize: `${Math.round(trackBox.width)}x${Math.round(trackBox.height)}`,
      };
    });
    expect(permStyle.inputOpacity).toBe('0');
    expect(permStyle.trackSize).toBe('42x24');
    // Снятый переключатель — цвета панели, а не системного белого
    if (!permStyle.checked) {
      expect(permStyle.trackBackground).toBe(permStyle.hover);
      expect(permStyle.trackBackground).not.toBe('rgb(255, 255, 255)');
    }

    /* Цвет роли выбирают из готовой палитры своими образцами: системного
       выбора цвета в окне нет вовсе, иначе поверх приложения открывался бы
       диалог операционной системы. */
    await expect(owner.locator('.role-swatch').first()).toBeVisible();
    await expect(owner.locator('.role-editor input[type=color]')).toHaveCount(0);

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

    // Кнопка «послушать» на вкладке звуков — самый короткий путь к звуку
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Звуки', exact: true }).click();
    const master = owner.locator('.settings-form .owner-switch input').first();
    const preview = owner.getByTitle('Послушать').first();
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

    // Общий выключатель гасит звуки целиком, и выбор переживает перезагрузку
    const played = await notes();
    await master.setChecked(false);
    await expect(preview).toBeDisabled();
    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Звуки', exact: true }).click();
    const masterAfter = owner.locator('.settings-form .owner-switch input').first();
    await expect(masterAfter).not.toBeChecked();
    expect(await notes()).toBeLessThanOrEqual(played);

    // Возвращаем звуки, чтобы следующий сценарий начинал с обычного состояния
    await masterAfter.setChecked(true);
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });
});

test.describe('Громкость и проверка микрофона', () => {
  test('ползунки применяются, запоминаются и полоска уровня работает', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();

    const mic = owner.getByLabel('Громкость микрофона');
    const output = owner.getByLabel('Громкость собеседников');
    await expect(mic).toBeVisible();
    await expect(output).toBeVisible();

    await mic.fill('160');
    await output.fill('40');
    await expect(owner.locator('.level-value').first()).toHaveText('160%');
    await expect(owner.locator('.level-value').nth(1)).toHaveText('40%');

    // Значения сохранены на клиенте, а не только в поле
    const saved = await owner.evaluate(() =>
      JSON.parse(localStorage.getItem('voxa-audio-levels') ?? '{}'),
    );
    expect(saved).toMatchObject({ micGain: 1.6, output: 0.4 });

    /* Полоска уровня идёт сама: включать проверку не надо, человек сразу
       видит, слышно ли его */
    const bars = owner.locator('.live-check .check-bars');
    await expect(bars).toBeVisible();
    await expect
      .poll(() => bars.evaluate((el) => Number(el.getAttribute('aria-valuenow') ?? 0)))
      .toBeGreaterThan(0);

    // Выбор переживает перезагрузку
    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();
    await expect(owner.getByLabel('Громкость микрофона')).toHaveValue('160');
    await expect(owner.getByLabel('Громкость собеседников')).toHaveValue('40');

    // Возвращаем как было: следующий сценарий начинает с обычной громкости
    await owner.getByLabel('Громкость микрофона').fill('100');
    await owner.getByLabel('Громкость собеседников').fill('100');
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });
});

test.describe('Облик', () => {
  test('переключается, запоминается и возвращает прежний вид', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();

    // По умолчанию новый облик: живой фон нарисован
    await expect(owner.locator('html')).toHaveAttribute('data-skin', 'flow');
    await expect(owner.locator('.app-backdrop')).toHaveCSS('display', 'block');

    await owner.getByRole('button', { name: 'Классический' }).click();
    await expect(owner.locator('html')).toHaveAttribute('data-skin', 'classic');
    // Классический — это прежний плотный вид: фона нет, панель непрозрачна
    await expect(owner.locator('.app-backdrop')).toHaveCSS('display', 'none');
    await expect(owner.locator('.sidebar')).toHaveCSS('background-color', 'rgb(15, 21, 33)');

    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(owner.locator('html')).toHaveAttribute('data-skin', 'classic');

    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();
    await owner.getByRole('button', { name: 'Поток' }).click();
    await expect(owner.locator('html')).toHaveAttribute('data-skin', 'flow');
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });

  /**
   * Окна живут внутри боковой панели. Размытие на самой панели делало её
   * точкой отсчёта для position: fixed — окно съезжало влево и теряло
   * затемнение. Проверяем именно это, а не «окно открылось».
   */
  test('окно настроек по центру экрана, а не внутри панели', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    const panel = owner.locator('.settings-panel');
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    const view = owner.viewportSize();
    expect(box && view).toBeTruthy();
    const panelCenter = box!.x + box!.width / 2;
    expect(Math.abs(panelCenter - view!.width / 2)).toBeLessThan(4);

    // Затемнение накрывает весь экран, а не кусок панели
    const overlay = await owner.locator('.settings-overlay').boundingBox();
    expect(overlay!.width).toBeGreaterThanOrEqual(view!.width - 1);

    await panel.getByTitle('Закрыть').click();
  });
});

test.describe('Плотность и движение', () => {
  test('компактный режим сжимает строки и запоминается', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    // Сразу после перехода строка ещё нулевой высоты — ждём отрисовки,
    // иначе сравниваем с нулём и тест врёт
    const row = owner.locator('.channel-link').first();
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    const rowHeight = async (): Promise<number> => {
      await expect
        .poll(() => row.evaluate((el) => el.getBoundingClientRect().height))
        .toBeGreaterThan(0);
      return row.evaluate((el) => el.getBoundingClientRect().height);
    };
    const cozy = await rowHeight();

    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();
    await owner.getByRole('button', { name: 'Компактно' }).click();
    await expect(owner.locator('html')).toHaveAttribute('data-density', 'compact');
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();

    const compact = await rowHeight();
    expect(compact).toBeLessThan(cozy);

    await owner.reload();
    await owner.locator('.user-card').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(owner.locator('html')).toHaveAttribute('data-density', 'compact');

    // Возвращаем просторный режим следующим сценариям
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Оформление' }).click();
    await owner.getByRole('button', { name: 'Просторно' }).click();
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });

  test('карточка профиля вылетает из того, по чему кликнули', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    const member = owner.locator('.member', { hasText: 'uitest_friend' }).first();
    const box = await member.boundingBox();
    const view = owner.viewportSize()!;
    await member.click();

    const card = owner.locator('.profile-modal');
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/grows/);

    /* Проверяем смещение, а не положение в кадре: положение зависит от того,
       в какой момент замерили, а смещение задано один раз и не меняется.
       Карточка стоит по центру, значит смещение — расстояние от центра
       экрана до места клика. */
    const shift = await card.evaluate((el) => ({
      dx: Number.parseFloat(getComputedStyle(el).getPropertyValue('--dx')),
      dy: Number.parseFloat(getComputedStyle(el).getPropertyValue('--dy')),
    }));
    expect(Math.abs(shift.dx - (box!.x + box!.width / 2 - view.width / 2))).toBeLessThan(4);
    expect(Math.abs(shift.dy - (box!.y + box!.height / 2 - view.height / 2))).toBeLessThan(4);
    // Смещение не нулевое, иначе движения не видно — ради этого всё и затевалось
    expect(Math.abs(shift.dx)).toBeGreaterThan(100);

    await owner.keyboard.press('Escape');
  });
});

test.describe('Управление звуком и видео', () => {
  /**
   * В канале не было камеры, в звонке — демонстрации экрана. Набор кнопок
   * должен быть один и тот же, иначе человек не понимает, что где доступно.
   */
  test('в голосовом канале есть все пять кнопок', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    // Клик по голосовому каналу сразу и переводит, и подключает
    await owner.locator('.channel-link.voice-link').first().click();

    const controls = owner.locator('.voice-controls');
    await expect(controls).toBeVisible();
    await expect(controls.getByTitle('Выключить микрофон')).toBeVisible();
    await expect(controls.getByTitle('Выключить звук')).toBeVisible();
    await expect(controls.getByTitle('Включить камеру')).toBeVisible();
    await expect(controls.getByTitle('Демонстрация экрана')).toBeVisible();
    await expect(controls.getByTitle('Отключиться')).toBeVisible();

    await controls.getByTitle('Отключиться').click();
  });

  test('в звонке есть все пять кнопок', async ({ owner }) => {
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);
    await owner.locator('.dm-header-actions').getByTitle('Голосовой звонок').click();

    const controls = owner.locator('.call-controls');
    await expect(controls.getByTitle('Выключить микрофон')).toBeVisible();
    await expect(controls.getByTitle('Выключить звук')).toBeVisible();
    await expect(controls.getByTitle('Включить камеру')).toBeVisible();
    await expect(controls.getByTitle('Демонстрация экрана')).toBeVisible();
    await expect(controls.getByTitle('Завершить звонок')).toBeVisible();

    await controls.getByTitle('Завершить звонок').click();
  });

  test('живая проверка себя: полоска уровня и запись с прослушиванием', async ({ owner }) => {
    await owner.locator('.user-card').getByTitle('Настройки').first().click();
    await owner.getByRole('button', { name: 'Голос и видео' }).click();

    // Полоска уровня идёт сама, без нажатий: человек должен сразу видеть,
    // слышно ли его
    const check = owner.locator('.live-check');
    await expect(check).toBeVisible();
    await expect(check.locator('.check-bars')).toBeVisible();

    // Запись и прослушивание — вместо прежнего возврата звука в наушники
    const record = owner.getByRole('button', { name: 'Записать и прослушать себя' });
    await expect(record).toBeVisible();
    await record.click();
    await expect(owner.getByRole('button', { name: 'Записываю… говори' })).toBeVisible();

    // Ждём, пока проверка отыграет и кнопка вернётся в исходное состояние
    await expect(record).toBeVisible({ timeout: 20_000 });
    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });
});

test.describe('Панель связи', () => {
  test('показывает канал, сервер и управление голосом', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.channel-link.voice-link').first().click();

    const panel = owner.locator('.voice-panel');
    await expect(panel).toBeVisible();

    // Где сижу: канал и через дробь сервер
    await expect(panel.locator('.voice-panel-name')).toHaveText('Общий');
    await expect(panel.locator('.voice-panel-guild')).toContainText('Сервер');
    await expect(panel.locator('.signal-bars')).toBeVisible();

    // Камера, демонстрация и шумоподавление — прямо в панели
    await expect(panel.getByTitle('Включить камеру')).toBeVisible();
    await expect(panel.getByTitle('Демонстрация экрана')).toBeVisible();
    const noise = panel.getByTitle('Выключить шумоподавление');
    await expect(noise).toBeVisible();

    // Шумоподавление включено по умолчанию и переключается
    await noise.click();
    await expect(panel.getByTitle('Включить шумоподавление')).toBeVisible();
    await panel.getByTitle('Включить шумоподавление').click();
    await expect(panel.getByTitle('Выключить шумоподавление')).toBeVisible();

    await panel.getByTitle('Отключиться').click();
    await expect(panel).toBeHidden();
  });

  /**
   * Микрофон, наушники и сама панель связи одни на всё приложение. Быть
   * одновременно в канале и в звонке нельзя: человек оказывался в двух
   * разговорах сразу и не понимал, кто его слышит.
   */
  test('звонок из лички выходит из голосового канала', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.channel-link.voice-link').first().click();
    await expect(owner.locator('.voice-panel-guild')).toBeVisible();

    // Звоним другу, не выходя из канала руками
    await owner.locator('.rail-icon.home').click();
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);
    await owner.locator('.dm-header-actions').getByTitle('Голосовой звонок').click();

    // Панель осталась одна и она про звонок: строки с сервером больше нет
    await expect(owner.locator('.voice-panel')).toHaveCount(1);
    await expect(owner.locator('.voice-panel-guild')).toHaveCount(0);
    await expect(owner.locator('.voice-panel.call')).toBeVisible();

    await owner.locator('.call-controls').getByTitle('Завершить звонок').click();
    await expect(owner.locator('.voice-panel')).toHaveCount(0);
  });
});

test.describe('Мелкие окна и поля', () => {
  test('настройки канала: галочка слева, кнопки на одной высоте', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.channel-row').first().hover();
    await owner.locator('.channel-row').first().locator('button').last().click();

    const modal = owner.locator('.add-server-modal');
    await expect(modal).toBeVisible();

    // Галочка стоит в строку с подписью, а не над ней
    const toggle = modal.locator('.settings-toggle');
    await expect(toggle).toHaveCSS('flex-direction', 'row');
    const boxRect = await toggle.locator('input').boundingBox();
    const labelRect = await toggle.boundingBox();
    expect(boxRect!.x).toBeLessThan(labelRect!.x + 40);

    // Кнопки одной высоты и на одной линии
    const remove = await modal.getByRole('button', { name: 'Удалить канал' }).boundingBox();
    const save = await modal.getByRole('button', { name: 'Сохранить' }).boundingBox();
    expect(Math.abs(remove!.height - save!.height)).toBeLessThan(2);
    expect(Math.abs(remove!.y - save!.y)).toBeLessThan(2);
    // Опасное действие слева, основное справа
    expect(remove!.x).toBeLessThan(save!.x);

    await owner.keyboard.press('Escape');
  });
});

test.describe('Эфир', () => {
  /**
   * Показ экрана должен быть виден остальным: без пометки непонятно, кого
   * смотреть. Сам показ в тесте не запустить — систему выбора окна рисует
   * браузер, — поэтому проверяем передачу состояния по сети напрямую.
   */
  test('пометка «в эфире» доходит до других участников', async ({ owner, friend }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.channel-link.voice-link').first().click();
    await expect(owner.locator('.voice-panel')).toBeVisible();

    await friend.locator('.rail-icon.server').first().click();
    await friend.waitForURL(/\/guilds\//);
    const row = friend.locator('.voice-participant', { hasText: 'uitest_owner' });
    await expect(row).toBeVisible();
    await expect(row.locator('.live-badge')).toHaveCount(0);

    // Объявляем эфир тем же событием, что и сам показ экрана
    await owner.evaluate(() => {
      const w = window as unknown as {
        __voxaAnnounceSharing?: (value: boolean) => void;
      };
      w.__voxaAnnounceSharing?.(true);
    });

    await expect(row.locator('.live-badge')).toHaveText('В эфире');
    // В строке участника перед подписью стоит значок, поэтому сверяем вхождение
    await expect(
      friend.locator('.member', { hasText: 'uitest_owner' }).locator('.member-status-text.sharing'),
    ).toContainText('демонстрирует экран');

    await owner.evaluate(() => {
      const w = window as unknown as {
        __voxaAnnounceSharing?: (value: boolean) => void;
      };
      w.__voxaAnnounceSharing?.(false);
    });
    await expect(row.locator('.live-badge')).toHaveCount(0);
  });
});

test.describe('Журнал действий', () => {
  test('показывает понятные названия, а не технические имена событий', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.server-header').click();
    await owner.getByRole('button', { name: 'Настройки сервера' }).click();
    await owner
      .locator('.settings-nav')
      .getByRole('button', { name: 'Журнал действий', exact: true })
      .click();

    const row = owner.locator('.audit-row').first();
    await expect(row).toBeVisible();
    const action = await row.locator('.audit-action').innerText();
    // Техническое имя вида invite.create читать невозможно
    expect(action).not.toMatch(/^[a-z]+\.[a-z.]+$/);
    expect(action.length).toBeGreaterThan(3);

    await owner.locator('.settings-panel').getByTitle('Закрыть').click();
  });
});

test.describe('Меню сервера закрывается', () => {
  test('Escape убирает выпадающее меню и заголовок снова доступен', async ({ owner }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);

    await owner.locator('.server-header').click();
    await expect(owner.locator('.server-dropdown')).toBeVisible();

    await owner.keyboard.press('Escape');
    await expect(owner.locator('.server-dropdown')).toBeHidden();

    // Заголовок больше ничем не перекрыт — меню открывается снова
    await owner.locator('.server-header').click();
    await expect(owner.locator('.server-dropdown')).toBeVisible();
    await owner.keyboard.press('Escape');
  });
});

test.describe('Один разговор', () => {
  /**
   * Воспроизводит жалобу: человек оставался и в канале, и в звонке. Причина
   * оказалась в том, что разрыв соединения может упасть — тогда весь код
   * уборки после него не выполнялся. Здесь разрыв ломается нарочно, потому
   * что при исправном соединении ошибка не воспроизводится вовсе.
   */
  test('сторож выкидывает из канала, даже если выход сорвался', async ({ owner, friend }) => {
    await owner.locator('.rail-icon.server').first().click();
    await owner.waitForURL(/\/guilds\//);
    await owner.locator('.channel-link.voice-link').first().click();
    await expect(owner.locator('.voice-panel')).toBeVisible();

    await friend.locator('.rail-icon.server').first().click();
    await friend.waitForURL(/\/guilds\//);
    const inChannel = friend.locator('.voice-participant', { hasText: 'uitest_owner' });
    await expect(inChannel).toHaveCount(1);

    // Ломаем разрыв соединения: так вёл бы себя мёртвый трек демонстрации
    await owner.evaluate(() => {
      const proto = RTCPeerConnection.prototype as unknown as { close: () => void };
      const original = proto.close;
      proto.close = function () {
        original.call(this);
        throw new Error('нарочно сломанный разрыв');
      };
    });

    await owner.locator('.rail-icon.home').click();
    await owner.getByRole('button', { name: 'Все', exact: true }).click();
    await owner.getByTitle('Написать').first().click();
    await owner.waitForURL(/\/dm\//);
    await owner.locator('.dm-header-actions').getByTitle('Голосовой звонок').click();

    // Панель одна и она про звонок, в канале человека больше нет
    await expect(owner.locator('.voice-panel.call')).toBeVisible();
    await expect(owner.locator('.voice-panel-guild')).toHaveCount(0);
    await expect(inChannel).toHaveCount(0);

    await owner.locator('.call-controls').getByTitle('Завершить звонок').click();
    await expect(owner.locator('.voice-panel')).toHaveCount(0);
    await expect(inChannel).toHaveCount(0);
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

    /* Кнопки разделов оформлены, а не серые системные. Ищем строго в столбце
       разделов: на обзоре есть ещё ссылка «Пользователи» из панели новичков. */
    const tab = panel.locator('.settings-nav').getByRole('button', { name: 'Пользователи' });
    const tabBg = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tabBg).toBe('rgba(0, 0, 0, 0)');

    await tab.click();
    await expect(panel.getByPlaceholder('Поиск по логину или имени')).toBeVisible();
    await expect(panel.getByText('uitest_friend').first()).toBeVisible();

    await panel.locator('.settings-nav').getByRole('button', { name: 'Серверы' }).click();
    await expect(panel.getByRole('heading', { name: 'Серверы' })).toBeVisible();

    await panel.locator('.settings-nav').getByRole('button', { name: 'Хранилище' }).click();
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

  /**
   * «Не беспокоить» и «отошёл» — это присутствие, человек на месте. В списке
   * друзей он должен быть среди тех, кто в сети, и подписан своим статусом.
   * Не в сети — только когда включена невидимка или человек действительно ушёл.
   */
  test('«не беспокоить» виден другу как статус, а не как офлайн', async ({ owner, friend }) => {
    /* Своя карточка показывает не выбранный режим, а то, как тебя видят
       другие: с невидимкой это «Не в сети». Поэтому ожидаемую подпись
       передаём отдельно от названия режима. */
    const setMode = async (label: string, ownLabel = label): Promise<void> => {
      await owner.locator('.user-card-identity').click();
      const menu = owner.locator('.profile-menu');
      await menu.locator('.menu-sub .menu-item').first().click();
      await menu.locator('.status-menu-item', { hasText: label }).click();
      await expect(owner.locator('.user-card-status')).toHaveText(ownLabel);
    };

    const rowInOnlineTab = async (): Promise<string | null> => {
      await friend.getByRole('button', { name: 'В сети', exact: true }).click();
      const row = friend.locator('.friend-row', { hasText: 'uitest_owner' });
      if ((await row.count()) === 0) return null;
      return row.locator('.friend-status').innerText();
    };

    await setMode('Не беспокоить');
    await expect.poll(rowInOnlineTab).toBe('Не беспокоить');

    await setMode('Отошёл');
    await expect.poll(rowInOnlineTab).toBe('Отошёл');

    // Невидимка — единственный режим, когда для других я не в сети
    await setMode('Невидимка', 'Не в сети');
    await expect.poll(rowInOnlineTab).toBeNull();
    await friend.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(
      friend.locator('.friend-row', { hasText: 'uitest_owner' }).locator('.friend-status'),
    ).toHaveText('Не в сети');

    await setMode('В сети');
    await expect.poll(rowInOnlineTab).toBe('В сети');
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
    // Микрофон, наушники, камера, демонстрация, завершить — набор проверяет
    // отдельный сценарий, здесь важно, что кнопки вообще есть
    await expect(stage.locator('.call-control')).toHaveCount(5);

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
