import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InstanceBanDto,
  InstanceGuildDto,
  InstanceOverviewDto,
  InstanceSettingsDto,
  InstanceSettingsInput,
  InstanceUserDto,
  StorageStatsDto,
} from '@voxa/shared';

import { api } from '../api/client';

const USERS_KEY = ['instanceUsers'] as const;
const BANS_KEY = ['instanceBans'] as const;
const GUILDS_KEY = ['instanceGuilds'] as const;
const SETTINGS_KEY = ['instanceSettings'] as const;
const STORAGE_KEY = ['instanceStorage'] as const;

export function useInstanceOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['instanceOverview'],
    queryFn: () => api<InstanceOverviewDto>('/instance/overview'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useInstanceUsers(query: string, enabled: boolean) {
  return useQuery({
    queryKey: [...USERS_KEY, query],
    queryFn: () =>
      api<InstanceUserDto[]>(`/instance/users${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    enabled,
  });
}

/** Полное закрытие доступа к приложению */
export function useInstanceBan() {
  const queryClient = useQueryClient();
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    void queryClient.invalidateQueries({ queryKey: BANS_KEY });
  };
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api<void>(`/instance/users/${userId}/ban`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSuccess: refresh,
  });
}

export function useInstanceUnban() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/instance/users/${userId}/ban`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      void queryClient.invalidateQueries({ queryKey: BANS_KEY });
    },
  });
}

export function useInstanceLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/instance/users/${userId}/logout`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useInstanceBans(enabled: boolean) {
  return useQuery({
    queryKey: BANS_KEY,
    queryFn: () => api<InstanceBanDto[]>('/instance/bans'),
    enabled,
  });
}

export function useInstanceGuilds(enabled: boolean) {
  return useQuery({
    queryKey: GUILDS_KEY,
    queryFn: () => api<InstanceGuildDto[]>('/instance/guilds'),
    enabled,
  });
}

export function useInstanceDeleteGuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => api<void>(`/instance/guilds/${guildId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GUILDS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['guilds'] });
    },
  });
}

export function useInstanceSettings(enabled: boolean) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api<InstanceSettingsDto>('/instance/settings'),
    enabled,
  });
}

export function useUpdateInstanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InstanceSettingsInput) =>
      api<InstanceSettingsDto>('/instance/settings', { method: 'PATCH', body: input }),
    onSuccess: (settings) => queryClient.setQueryData(SETTINGS_KEY, settings),
  });
}

export function useInstanceStorage(enabled: boolean) {
  return useQuery({
    queryKey: STORAGE_KEY,
    queryFn: () => api<StorageStatsDto>('/instance/storage'),
    enabled,
  });
}

export function useCleanupStorage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ removed: number }>('/instance/storage/cleanup', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: STORAGE_KEY }),
  });
}
