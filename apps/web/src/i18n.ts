import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import ru from './locales/ru.json';

// Все строки интерфейса — только через словарь (раздел 10 PRD).
// Английский добавим после запуска: достаточно положить locales/en.json.
void i18next.use(initReactI18next).init({
  lng: 'ru',
  fallbackLng: 'ru',
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
});

export default i18next;
