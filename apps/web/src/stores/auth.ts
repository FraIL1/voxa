import type { AuthResponseDto, MeDto } from '@voxa/shared';
import { create } from 'zustand';

type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: MeDto | null;
  /** Причина принудительного выхода (кик/бан) — показывается на странице входа */
  logoutNotice: string | null;
  setSession: (token: string, user: MeDto) => void;
  /** Обновление профиля без смены токена (после PATCH /users/me) */
  setUser: (user: MeDto) => void;
  clearSession: (notice?: string) => void;
  /** Восстановление сессии по refresh-cookie при старте приложения */
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  logoutNotice: null,

  setSession: (accessToken, user) =>
    set({ status: 'authed', accessToken, user, logoutNotice: null }),

  setUser: (user) => set({ user }),

  clearSession: (notice) =>
    set({ status: 'guest', accessToken: null, user: null, logoutNotice: notice ?? null }),

  bootstrap: async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        set({ status: 'guest', accessToken: null, user: null });
        return;
      }
      const data = (await res.json()) as AuthResponseDto;
      set({ status: 'authed', accessToken: data.accessToken, user: data.user });
    } catch {
      set({ status: 'guest', accessToken: null, user: null });
    }
  },
}));
