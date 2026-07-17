import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminOverviewDto,
  AuditPageDto,
  BanDto,
  CreateInviteInput,
  InviteDto,
} from '@voxa/shared';

import { api } from '../api/client';

const INVITES_KEY = ['invites'] as const;
const BANS_KEY = ['bans'] as const;

export function useInvites(enabled: boolean) {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: () => api<InviteDto[]>('/invites'),
    enabled,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      api<InviteDto>('/invites', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useBans(enabled: boolean) {
  return useQuery({
    queryKey: BANS_KEY,
    queryFn: () => api<BanDto[]>('/moderation/bans'),
    enabled,
  });
}

export function useUnban() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/moderation/bans/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BANS_KEY });
      // Флаг banned в списке участников тоже должен обновиться
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['adminOverview'],
    queryFn: () => api<AdminOverviewDto>('/admin/overview'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useAudit(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) =>
      api<AuditPageDto>(`/admin/audit?limit=50${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.items[lastPage.items.length - 1]?.id : undefined,
    enabled,
  });
}
