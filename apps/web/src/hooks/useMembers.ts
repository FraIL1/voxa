import { useQuery } from '@tanstack/react-query';
import type { MemberDto } from '@voxa/shared';

import { api } from '../api/client';

/** Базовый префикс: ['members', guildId] — инвалидация по ['members'] бьёт по всем серверам */
export const MEMBERS_KEY = ['members'] as const;

export function membersKey(guildId: string | undefined): readonly unknown[] {
  return ['members', guildId];
}

export function useMembers(guildId: string | undefined) {
  return useQuery({
    queryKey: membersKey(guildId),
    queryFn: () => api<MemberDto[]>(`/guilds/${guildId}/members`),
    staleTime: 60_000, // статусы держит WebSocket, состав меняется редко
    enabled: Boolean(guildId),
  });
}
