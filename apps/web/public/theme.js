// Применяет сохранённую тему до первого кадра — иначе светлая мигает тёмным.
// Отдельным файлом, а не встроенным скриптом: так работает строгая CSP.
try {
  var saved = localStorage.getItem('voxa-theme');
  var light =
    saved === 'light' || (saved === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
} catch (e) {
  /* приватный режим без localStorage — останется тёмная тема */
}
