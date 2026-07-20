import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { api } from '../api/client';
import { MEMBERS_KEY } from './useMembers';

/** Модерационные действия из контекст-меню участника (текущий сервер из маршрута) */
export function useModeration() {
  const queryClient = useQueryClient();
  const { guildId } = useParams<{ guildId: string }>();
  const invalidateMembers = (): void => {
    void queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
  };

  const kick = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api<void>(`/guilds/${guildId}/members/${userId}/kick`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: invalidateMembers,
  });

  const ban = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api<void>(`/guilds/${guildId}/members/${userId}/ban`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: invalidateMembers,
  });

  const timeout = useMutation({
    mutationFn: ({ userId, minutes }: { userId: string; minutes: number }) =>
      api<{ until: string }>(`/guilds/${guildId}/members/${userId}/timeout`, {
        method: 'POST',
        body: { minutes },
      }),
    onSuccess: invalidateMembers,
  });

  const clearTimeout = useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/guilds/${guildId}/members/${userId}/timeout`, { method: 'DELETE' }),
    onSuccess: invalidateMembers,
  });

  return { kick, ban, timeout, clearTimeout };
}
