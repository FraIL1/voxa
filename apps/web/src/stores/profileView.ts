import { create } from 'zustand';

interface ProfileViewState {
  /** Чей профиль показан поверх интерфейса (null — закрыт) */
  userId: string | null;
  open: (userId: string) => void;
  close: () => void;
}

/**
 * Карточка профиля открывается из разных мест — списка участников, автора
 * сообщения, друзей. Стор держит одну карточку на всё приложение.
 */
export const useProfileViewStore = create<ProfileViewState>()((set) => ({
  userId: null,
  open: (userId) => set({ userId }),
  close: () => set({ userId: null }),
}));

/** Открыть профиль из обработчика клика, без подписки на стор */
export function openProfile(userId: string): void {
  useProfileViewStore.getState().open(userId);
}
