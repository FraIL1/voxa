import { create } from 'zustand';

/** Оформление: тёмное, светлое или «как в системе» */
export type ThemeMode = 'dark' | 'light' | 'auto';

const KEY = 'voxa-theme';

function readStored(): ThemeMode {
  const raw = localStorage.getItem(KEY);
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'dark';
}

/** Какая тема реально показывается сейчас (auto спрашивает систему) */
function resolve(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'auto') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function paint(mode: ThemeMode): 'dark' | 'light' {
  const applied = resolve(mode);
  document.documentElement.dataset.theme = applied;
  return applied;
}

interface ThemeState {
  mode: ThemeMode;
  /** Действующая тема — для компонентов, которым важен фон */
  applied: 'dark' | 'light';
  setMode: (mode: ThemeMode) => void;
}

const initial = readStored();

export const useThemeStore = create<ThemeState>()((set) => ({
  mode: initial,
  applied: paint(initial),

  setMode: (mode) => {
    localStorage.setItem(KEY, mode);
    set({ mode, applied: paint(mode) });
  },
}));

// В режиме «как в системе» следим за переключением темы ОС
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  const { mode } = useThemeStore.getState();
  if (mode === 'auto') useThemeStore.setState({ applied: paint('auto') });
});
