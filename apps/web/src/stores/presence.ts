import type { PresenceStatus } from '@voxa/shared';
import { create } from 'zustand';

interface PresenceState {
  /** Как меня видят другие прямо сейчас (с учётом простоя и режима) */
  myStatus: PresenceStatus;
  setMyStatus: (status: PresenceStatus) => void;
}

/**
 * Свой показываемый статус приходит тем же событием presence.update, что и
 * чужие. Без него карточка внизу показывала выбранный режим и расходилась
 * со списком участников, когда включался автоматический «отошёл».
 */
export const usePresenceStore = create<PresenceState>()((set) => ({
  myStatus: 'online',
  setMyStatus: (status) => set({ myStatus: status }),
}));
