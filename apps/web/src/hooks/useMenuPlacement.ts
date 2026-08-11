import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Отступ от края окна, чтобы меню не липло к самой кромке */
const EDGE = 8;

/**
 * Разворачивает подменю вверх, если снизу не хватает места. Без этого
 * список статусов у нижней кромки уезжал за экран.
 */
export function useSubmenuFlip(open: boolean): {
  ref: RefObject<HTMLDivElement | null>;
  up: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const element = ref.current;
    if (!element) return;
    // Меряем в исходном положении: класс up ставится только если не влезли
    const box = element.getBoundingClientRect();
    setUp(box.bottom > window.innerHeight - EDGE);
  }, [open]);

  return { ref, up };
}

/**
 * Держит контекстное меню в границах окна: у нижнего или правого края
 * оно раскрывается в противоположную сторону от курсора.
 */
export function useAnchoredMenu(
  x: number,
  y: number,
): {
  ref: RefObject<HTMLDivElement | null>;
  style: { left?: number; right?: number; top?: number; bottom?: number };
  flipLeft: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState({ left: false, up: false });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    setFlip({
      // Слева от курсора: справа не хватает места самому меню или его подменю
      left: x + box.width + 240 > window.innerWidth,
      up: y + box.height > window.innerHeight - EDGE,
    });
  }, [x, y]);

  return {
    ref,
    style: {
      ...(flip.left ? { right: window.innerWidth - x } : { left: x }),
      ...(flip.up ? { bottom: window.innerHeight - y } : { top: y }),
    },
    flipLeft: flip.left,
  };
}
