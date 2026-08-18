import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
  /** Показан ли список участников. Скрыт — переписке достаётся его ширина. */
  membersOpen: boolean;
  toggleMembers: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      membersOpen: true,
      toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen })),
    }),
    { name: 'voxa.layout' },
  ),
);
