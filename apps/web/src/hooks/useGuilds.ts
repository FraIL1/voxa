import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateGuildInput, GuildDto, JoinGuildResultDto } from '@voxa/shared';

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
