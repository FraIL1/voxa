import { create } from 'zustand';

/**
 * Облик приложения. Отдельная ось от темы: тёмное/светлое остаётся как было,
 * а облик меняет материал поверхностей, свет и движение.
 *
 * «Классический» сохранён намеренно — это тот вид, с которым проект жил до
 * переделки, и вернуться к нему можно одним переключателем, без отката кода.
 */
export type Skin = 'flow' | 'classic';

const KEY = 'voxa-skin';

function readStored(): Skin {
  try {
    // Всё, кроме явного «классического», считаем новым обликом: так старое
    // сохранённое значение не оставляет человека с несуществующим видом
    return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'flow';
  } catch {
    return 'flow';
  }
}

function paint(skin: Skin): void {
  document.documentElement.dataset.skin = skin;
}

interface SkinState {
  skin: Skin;
  setSkin: (skin: Skin) => void;
}

const initial = readStored();
paint(initial);

export const useSkinStore = create<SkinState>()((set) => ({
  skin: initial,

  setSkin: (skin) => {
    try {
      localStorage.setItem(KEY, skin);
    } catch {
      // приватный режим — выбор действует до перезагрузки
    }
    paint(skin);
    set({ skin });
  },
}));
