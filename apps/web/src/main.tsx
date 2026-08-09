import '@fontsource-variable/inter';
import './styles.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
// Импорт применяет сохранённую тему до первого кадра — без вспышки тёмного
import './stores/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Элемент #root не найден');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
