import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminOverviewDto,
  AuditPageDto,
  BanDto,
  CreateInviteInput,
  InviteDto,
} from '@voxa/shared';

import { api } from '../api/client';

const invitesKey = (guildId: string | undefined) => ['invites', guildId] as const;
const bansKey = (guildId: string | undefined) => ['bans', guildId] as const;

export function useInvites(guildId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: invitesKey(guildId),
    queryFn: () => api<InviteDto[]>(`/guilds/${guildId}/invites`),
    enabled: enabled && Boolean(guildId),
  });
}

export function useCreateInvite(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) =>
      api<InviteDto>(`/guilds/${guildId}/invites`, { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitesKey(guildId) }),
  });
}

export function useRevokeInvite(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitesKey(guildId) }),
  });
}

export function useBans(guildId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: bansKey(guildId),
    queryFn: () => api<BanDto[]>(`/guilds/${guildId}/bans`),
    enabled: enabled && Boolean(guildId),
  });
}

export function useUnban(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/guilds/${guildId}/bans/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bansKey(guildId) });
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

export function useAudit(guildId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['audit', guildId],
    queryFn: ({ pageParam }) =>
      api<AuditPageDto>(
        `/guilds/${guildId}/audit?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.items[lastPage.items.length - 1]?.id : undefined,
    enabled: enabled && Boolean(guildId),
  });
}
