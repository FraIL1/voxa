import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserProfileDto } from '@voxa/shared';

import { api } from '../api/client';
import { DM_CONVERSATIONS_KEY } from '../api/dm-cache';

export const profileKey = (userId: string): readonly unknown[] => ['profile', userId] as const;

/** Карточка профиля участника: кто он, как мы связаны, где пересекаемся */
export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: profileKey(userId ?? ''),
    queryFn: () => api<UserProfileDto>(`/users/${userId}/profile`),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

/** Перечитать карточку после действия (дружба, блокировка) */
export function useRefreshProfile(): (userId: string) => void {
  const queryClient = useQueryClient();
  return (userId: string) => void queryClient.invalidateQueries({ queryKey: profileKey(userId) });
}

/** Личная заметка и своё имя для человека (видно только мне) */
export function useSetUserNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, note, alias }: { userId: string; note?: string; alias?: string }) =>
      api<{ note: string | null; alias: string | null }>(`/users/${userId}/note`, {
        method: 'PATCH',
        body: {
          ...(note === undefined ? {} : { note }),
          ...(alias === undefined ? {} : { alias }),
        },
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: profileKey(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY });
    },
  });
}
