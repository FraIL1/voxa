import { useQuery } from '@tanstack/react-query';
import type { MemberDto } from '@voxa/shared';

import { api } from '../api/client';

export const MEMBERS_KEY = ['members'] as const;

export function useMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<MemberDto[]>('/users'),
    staleTime: 60_000, // статусы держит WebSocket, состав меняется редко
  });
}
