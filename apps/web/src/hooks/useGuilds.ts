import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGuildInput,
  DiscoverGuildDto,
  GuildDto,
  GuildJoinRequestDto,
  JoinAttemptResultDto,
  JoinGuildResultDto,
} from '@voxa/shared';

import { api } from '../api/client';

export const GUILDS_KEY = ['guilds'] as const;

export function useGuilds() {
  return useQuery({
    queryKey: GUILDS_KEY,
    queryFn: () => api<GuildDto[]>('/guilds'),
    staleTime: 60_000, // изменения приходят по WS (me.guilds)
  });
}

/** Текущий сервер и мои права на нём (0, пока список не загружен) */
export function useGuild(guildId: string | undefined): GuildDto | undefined {
  const { data } = useGuilds();
  return guildId ? data?.find((g) => g.id === guildId) : undefined;
}

export function useMyGuildPermissions(guildId: string | undefined): number {
  return useGuild(guildId)?.myPermissions ?? 0;
}

export function useCreateGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGuildInput) =>
      api<GuildDto>('/guilds', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GUILDS_KEY }),
  });
}

export function useJoinGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<JoinGuildResultDto>(`/invites/${code}/join`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GUILDS_KEY }),
  });
}

export function useLeaveGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => api<void>(`/guilds/${guildId}/leave`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GUILDS_KEY }),
  });
}

/** Передача владения сервером другому участнику */
export function useTransferGuild(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<GuildDto>(`/guilds/${guildId}/transfer`, { method: 'POST', body: { userId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GUILDS_KEY }),
  });
}

/** Удаление сервера владельцем */
export function useDeleteGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => api<void>(`/guilds/${guildId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GUILDS_KEY }),
  });
}

// ---------- Витрина и заявки ----------

const DISCOVER_KEY = ['discoverGuilds'] as const;

export function useDiscoverGuilds(query: string, enabled: boolean) {
  return useQuery({
    queryKey: [...DISCOVER_KEY, query],
    queryFn: () =>
      api<DiscoverGuildDto[]>(`/guilds/discover${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    enabled,
  });
}

/** Вступить в сервер из витрины (или отправить заявку) */
export function useJoinGuildById() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guildId, message }: { guildId: string; message?: string }) =>
      api<JoinAttemptResultDto>(`/guilds/${guildId}/join`, {
        method: 'POST',
        body: message ? { message } : {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GUILDS_KEY });
      void queryClient.invalidateQueries({ queryKey: DISCOVER_KEY });
    },
  });
}

export function useCancelJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => api<void>(`/guilds/${guildId}/join`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DISCOVER_KEY }),
  });
}

export function joinRequestsKey(guildId: string | undefined): readonly unknown[] {
  return ['joinRequests', guildId];
}

export function useGuildJoinRequests(guildId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: joinRequestsKey(guildId),
    queryFn: () => api<GuildJoinRequestDto[]>(`/guilds/${guildId}/join-requests`),
    enabled: enabled && Boolean(guildId),
  });
}

export function useResolveJoinRequest(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, approve }: { userId: string; approve: boolean }) =>
      api<void>(`/guilds/${guildId}/join-requests/${userId}`, {
        method: approve ? 'POST' : 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: joinRequestsKey(guildId) });
      void queryClient.invalidateQueries({ queryKey: ['members', guildId] });
    },
  });
}
