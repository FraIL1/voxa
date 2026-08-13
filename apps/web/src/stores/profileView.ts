import { create } from 'zustand';

/** Откуда карточка вырастает: центр элемента, по которому кликнули */
export interface ProfileOrigin {
  x: number;
  y: number;
}

interface ProfileViewState {
  /** Чей профиль показан поверх интерфейса (null — закрыт) */
  userId: string | null;
  /** Точка старта появления; null — открыли не кликом (например, с клавиатуры) */
  origin: ProfileOrigin | null;
  open: (userId: string, origin?: ProfileOrigin | null) => void;
  close: () => void;
}

/**
 * Карточка профиля открывается из разных мест — списка участников, автора
 * сообщения, друзей. Стор держит одну карточку на всё приложение.
 */
export const useProfileViewStore = create<ProfileViewState>()((set) => ({
  userId: null,
  origin: null,
  open: (userId, origin = null) => set({ userId, origin }),
  close: () => set({ userId: null, origin: null }),
}));

/**
 * Открыть профиль из обработчика клика, без подписки на стор.
 * Событие передавать не обязательно: без него карточка просто появится
 * по центру, как раньше.
 */
export function openProfile(userId: string, event?: { currentTarget: Element } | null): void {
  let origin: ProfileOrigin | null = null;
  if (event?.currentTarget) {
    const box = event.currentTarget.getBoundingClientRect();
    origin = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  useProfileViewStore.getState().open(userId, origin);
}
