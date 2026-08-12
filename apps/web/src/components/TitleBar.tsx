import { Minus, Square, X } from 'lucide-react';

import { isTauri, minimizeWindow, toggleMaximizeWindow, hideWindow } from '../lib/tauri';

/**
 * Своя полоса заголовка десктопного окна. Системная рамка отключена, поэтому
 * перетаскивание, сворачивание и закрытие рисует само приложение — так окно
 * выглядит частью Voxa, а не браузером с сайтом внутри.
 */
export default function TitleBar() {
  if (!isTauri()) return null;

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-mark">V</span>
        Voxa
      </span>

      <div className="titlebar-controls">
        <button className="titlebar-button" title="Свернуть" onClick={() => void minimizeWindow()}>
          <Minus size={15} />
        </button>
        <button
          className="titlebar-button"
          title="Развернуть"
          onClick={() => void toggleMaximizeWindow()}
        >
          <Square size={12} />
        </button>
        {/* Закрытие прячет окно в трей — приложение продолжает принимать звонки */}
        <button
          className="titlebar-button close"
          title="Свернуть в трей"
          onClick={() => void hideWindow()}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
