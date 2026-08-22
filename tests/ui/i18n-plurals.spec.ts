import { test, expect } from '@playwright/test';
import { createInstance } from 'i18next';

import ru from '../../apps/web/src/locales/ru.json';

/*
 * Русская плюрализация в подписях интерфейса.
 *
 * Русский требует три формы: 1 участник, 2 участника, 5 участников. Выбор
 * формы делает i18next, а не наш код, поэтому при смене её версии это первое,
 * что может тихо поехать: подпись не исчезнет, а просто станет неграмотной —
 * «5 участник». Тестами интерфейса такое не ловится, они смотрят на другое.
 *
 * Браузер тут не нужен: проверяем сам словарь и подстановку.
 */
const i18n = createInstance();

test.beforeAll(async () => {
  await i18n.init({
    lng: 'ru',
    fallbackLng: 'ru',
    resources: { ru: { translation: ru } },
    interpolation: { escapeValue: false },
  });
});

test.describe('Склонение подписей по числу', () => {
  test('участники в разговоре', () => {
    expect(i18n.t('call.participants', { count: 1 })).toBe('1 участник');
    expect(i18n.t('call.participants', { count: 2 })).toBe('2 участника');
    expect(i18n.t('call.participants', { count: 5 })).toBe('5 участников');
    // Хвосты, на которых обычно и ломается: 21 как 1, 22 как 2, 11 как 5
    expect(i18n.t('call.participants', { count: 21 })).toBe('21 участник');
    expect(i18n.t('call.participants', { count: 22 })).toBe('22 участника');
    expect(i18n.t('call.participants', { count: 11 })).toBe('11 участников');
  });

  test('длительность звонка', () => {
    expect(i18n.t('call.durSeconds', { count: 1 })).toBe('1 секунда');
    expect(i18n.t('call.durSeconds', { count: 3 })).toBe('3 секунды');
    expect(i18n.t('call.durSeconds', { count: 30 })).toBe('30 секунд');

    expect(i18n.t('call.durMinutes', { count: 1 })).toBe('1 минута');
    expect(i18n.t('call.durMinutes', { count: 4 })).toBe('4 минуты');
    expect(i18n.t('call.durMinutes', { count: 7 })).toBe('7 минут');

    expect(i18n.t('call.durHours', { count: 1 })).toBe('1 час');
    expect(i18n.t('call.durHours', { count: 2 })).toBe('2 часа');
    expect(i18n.t('call.durHours', { count: 5 })).toBe('5 часов');
  });

  test('подстановка имени в строку', () => {
    // Не склонение, но та же механика: если сломается — увидим «{{name}}»
    expect(i18n.t('call.recordMissed', { name: 'raiLi' })).toBe('Пропущенный звонок от raiLi');
  });

  test('несуществующий ключ виден, а не проглочен', () => {
    // Иначе опечатка в ключе молча превратилась бы в пустое место
    expect(i18n.t('call.такогоКлючаНет')).toBe('call.такогоКлючаНет');
  });
});
