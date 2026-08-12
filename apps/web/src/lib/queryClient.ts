import { QueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../stores/auth';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * Кэш ответов принадлежит аккаунту. Без этого после смены пользователя в той
 * же вкладке на экране оставались ответы прошлого аккаунта — например, его
 * диалоги в списке личных сообщений: они показывались из кэша, а при переходе
 * исчезали. Чужие данные показывать нельзя, поэтому на каждой смене
 * пользователя кэш сбрасывается целиком.
 */
let lastUserId: string | null = null;
useAuthStore.subscribe((state) => {
  const userId = state.user?.id ?? null;
  if (userId === lastUserId) return;
  lastUserId = userId;
  queryClient.clear();
});
