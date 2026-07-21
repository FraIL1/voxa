import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelType,
  CreateRoleInput,
  GuildDto,
  RoleDto,
  UpdateGuildInput,
  UpdateRoleInput,
} from '@voxa/shared';

import { api } from '../api/client';
import { GUILDS_KEY } from './useGuilds';

const rolesKey = (guildId: string | undefined) => ['roles', guildId] as const;
const structureKey = (guildId: string | undefined) => ['structure', guildId] as const;

export function useGuildRoles(guildId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: rolesKey(guildId),
    queryFn: () => api<RoleDto[]>(`/guilds/${guildId}/roles`),
    enabled: enabled && Boolean(guildId),
    staleTime: 60_000,
  });
}

export function useUpdateGuild(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGuildInput) =>
      api<GuildDto>(`/guilds/${guildId}`, { method: 'PATCH', body: input }),
    // Мгновенно обновляем кэш возвращённым сервером (иконка/имя видны сразу)
    onSuccess: (updated) =>
      queryClient.setQueryData<GuildDto[]>(GUILDS_KEY, (list) =>
        list?.map((g) => (g.id === updated.id ? updated : g)),
      ),
  });
}

export function useSetNickname(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nickname: string) =>
      api<void>(`/guilds/${guildId}/members/me/nickname`, { method: 'PATCH', body: { nickname } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['members', guildId] }),
  });
}

export function useCreateRole(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) =>
      api<RoleDto>(`/guilds/${guildId}/roles`, { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rolesKey(guildId) }),
  });
}

export function useUpdateRole(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: UpdateRoleInput }) =>
      api<RoleDto>(`/guilds/${guildId}/roles/${roleId}`, { method: 'PATCH', body: input }),
    onSuccess: (updated) => {
      queryClient.setQueryData<RoleDto[]>(rolesKey(guildId), (list) =>
        list?.map((r) => (r.id === updated.id ? updated : r)),
      );
      // Цвет/имя роли влияют на отображение участников
      void queryClient.invalidateQueries({ queryKey: ['members', guildId] });
    },
  });
}

export function useDeleteRole(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) =>
      api<void>(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rolesKey(guildId) }),
  });
}

export function useAssignRole(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId, assign }: { userId: string; roleId: string; assign: boolean }) =>
      api<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
        method: assign ? 'PUT' : 'DELETE',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['members', guildId] }),
  });
}

export function useCreateChannel(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: ChannelType; categoryId?: string | null }) =>
      api(`/guilds/${guildId}/channels`, { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: structureKey(guildId) }),
  });
}

export function useCreateCategory(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(`/guilds/${guildId}/categories`, { method: 'POST', body: { name } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: structureKey(guildId) }),
  });
}

export function useUpdateChannel(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, input }: { channelId: string; input: Record<string, unknown> }) =>
      api(`/channels/${channelId}`, { method: 'PATCH', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: structureKey(guildId) }),
  });
}

export function useDeleteChannel(guildId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api<void>(`/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: structureKey(guildId) }),
  });
}
