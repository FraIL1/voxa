import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserProfileDto } from '@voxa/shared';

import { api } from '../api/client';

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
