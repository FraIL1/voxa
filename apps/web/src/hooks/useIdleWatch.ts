import { useEffect } from 'react';

import { emitPresenceIdle } from '../api/socket';

/** Через сколько без действий человек считается отошедшим */
const IDLE_AFTER_MS = 10 * 60 * 1000;

/**
 * Следит за простоем: десять минут без мыши, клавиатуры и без фокуса окна —
 * и другим видно «отошёл». Любое действие возвращает обычный статус.
 */
export function useIdleWatch(): void {
  useEffect(() => {
    let idle = false;
    let timer = window.setTimeout(markIdle, IDLE_AFTER_MS);

    function markIdle(): void {
      if (idle) return;
      idle = true;
      emitPresenceIdle(true);
    }

    function wake(): void {
      window.clearTimeout(timer);
      timer = window.setTimeout(markIdle, IDLE_AFTER_MS);
      if (!idle) return;
      idle = false;
      emitPresenceIdle(false);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'focus'];
    for (const name of events) window.addEventListener(name, wake, { passive: true });

    // Свёрнутое окно — тоже простой, но без ожидания десяти минут
    const onVisibility = (): void => {
      if (document.hidden) markIdle();
      else wake();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
