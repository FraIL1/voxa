import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Действия, которые можно повесить на клавиши */
export type HotkeyAction =
  'mute' | 'deafen' | 'switcher' | 'leaveVoice' | 'camera' | 'share' | 'answer' | 'decline';

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  'mute',
  'deafen',
  'switcher',
  'leaveVoice',
  'camera',
  'share',
  'answer',
  'decline',
];

/**
 * Сочетание хранится разобранным, а не строкой: так его можно и показать
 * человеку, и сверить с событием клавиатуры без разбора текста каждый раз.
 */
export interface Combo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** KeyboardEvent.code — не зависит от раскладки, работает и на кириллице */
  code: string;
}

const DEFAULTS: Record<HotkeyAction, Combo | null> = {
  mute: { ctrl: true, shift: true, alt: false, code: 'KeyM' },
  deafen: { ctrl: true, shift: true, alt: false, code: 'KeyD' },
  switcher: { ctrl: true, shift: false, alt: false, code: 'KeyK' },
  leaveVoice: { ctrl: true, shift: true, alt: false, code: 'KeyQ' },
  camera: { ctrl: true, shift: true, alt: false, code: 'KeyV' },
  share: { ctrl: true, shift: true, alt: false, code: 'KeyS' },
  answer: { ctrl: true, shift: true, alt: false, code: 'Enter' },
  decline: { ctrl: true, shift: true, alt: false, code: 'Escape' },
};

interface HotkeysState {
  binds: Record<HotkeyAction, Combo | null>;
  set: (action: HotkeyAction, combo: Combo | null) => void;
  reset: () => void;
}

export const useHotkeysStore = create<HotkeysState>()(
  persist(
    (set) => ({
      binds: DEFAULTS,
      /* Одно сочетание — одно действие. Занятое снимаем с прежнего владельца,
         иначе два действия молча сработают на одно нажатие. */
      set: (action, combo) =>
        set((s) => {
          const binds = { ...s.binds };
          if (combo) {
            for (const key of HOTKEY_ACTIONS) {
              if (key !== action && sameCombo(binds[key], combo)) binds[key] = null;
            }
          }
          binds[action] = combo;
          return { binds };
        }),
      reset: () => set({ binds: DEFAULTS }),
    }),
    {
      name: 'voxa.hotkeys',
      // Появилось новое действие — берём для него значение по умолчанию
      merge: (saved, current) => ({
        ...current,
        ...(saved as HotkeysState),
        binds: { ...DEFAULTS, ...((saved as HotkeysState)?.binds ?? {}) },
      }),
    },
  ),
);

export function sameCombo(a: Combo | null, b: Combo | null): boolean {
  if (!a || !b) return false;
  return a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.code === b.code;
}

/** Совпало ли нажатие с сочетанием */
export function matchesCombo(combo: Combo | null, e: KeyboardEvent): boolean {
  if (!combo) return false;
  return (
    combo.code === e.code &&
    combo.ctrl === (e.ctrlKey || e.metaKey) &&
    combo.shift === e.shiftKey &&
    combo.alt === e.altKey
  );
}

const NAMES: Record<string, string> = {
  Escape: 'Esc',
  Enter: 'Enter',
  Space: 'Пробел',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Человеческая запись сочетания для показа в настройках */
export function comboLabel(combo: Combo | null): string {
  if (!combo) return '—';
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  parts.push(NAMES[combo.code] ?? combo.code.replace(/^(Key|Digit)/, ''));
  return parts.join(' + ');
}

/** Запись для системного слоя Tauri: он ждёт строку вида CommandOrControl+Shift+M */
export function comboAccelerator(combo: Combo | null): string | null {
  if (!combo) return null;
  const parts: string[] = [];
  if (combo.ctrl) parts.push('CommandOrControl');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  parts.push(combo.code.replace(/^(Key|Digit)/, ''));
  return parts.join('+');
}

/** Читает сочетание из нажатия. Одни модификаторы сочетанием не считаются. */
export function comboFromEvent(e: KeyboardEvent): Combo | null {
  if (
    ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'].includes(
      e.code,
    )
  )
    return null;
  return {
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
    code: e.code,
  };
}
