import { create } from 'zustand';

/**
 * Плотность интерфейса. Третья ось оформления рядом с темой и обликом:
 * на ноутбуке хочется уместить больше строк, на большом экране — дышать.
 * У Discord плотность одна на всех, и это давняя жалоба.
 */
export type Density = 'cozy' | 'compact';

const KEY = 'voxa-density';

function readStored(): Density {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'cozy';
  } catch {
    return 'cozy';
  }
}

function paint(density: Density): void {
  document.documentElement.dataset.density = density;
}

interface DensityState {
  density: Density;
  setDensity: (density: Density) => void;
}

const initial = readStored();
paint(initial);

export const useDensityStore = create<DensityState>()((set) => ({
  density: initial,

  setDensity: (density) => {
    try {
      localStorage.setItem(KEY, density);
    } catch {
      // приватный режим — выбор действует до перезагрузки
    }
    paint(density);
    set({ density });
  },
}));
