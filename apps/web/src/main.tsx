import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './styles.css';
import './skin-prism.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
// Импорт применяет сохранённую тему до первого кадра — без вспышки тёмного
import './stores/theme';
import './stores/skin';
import './stores/density';

const root = document.getElementById('root');
if (!root) throw new Error('Элемент #root не найден');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
