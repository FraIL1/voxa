import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import { MEMBERS_KEY } from './useMembers';

/** Модерационные действия из контекст-меню участника */
export function useModeration() {
  const queryClient = useQueryClient();
  const invalidateMembers = (): void => {
    void queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
  };

  const kick = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api<void>(`/moderation/users/${userId}/kick`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
  });

  const ban = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api<void>(`/moderation/users/${userId}/ban`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: invalidateMembers,
  });

  const timeout = useMutation({
    mutationFn: ({ userId, minutes }: { userId: string; minutes: number }) =>
      api<{ until: string }>(`/moderation/users/${userId}/timeout`, {
        method: 'POST',
        body: { minutes },
      }),
    onSuccess: invalidateMembers,
  });

  const clearTimeout = useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/moderation/users/${userId}/timeout`, { method: 'DELETE' }),
    onSuccess: invalidateMembers,
  });

  return { kick, ban, timeout, clearTimeout };
}
