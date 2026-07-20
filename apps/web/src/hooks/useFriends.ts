import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BlockedUserDto,
  FriendDto,
  FriendRequestDto,
  SendFriendRequestResultDto,
} from '@voxa/shared';

import { api } from '../api/client';

export const FRIENDS_KEY = ['friends'] as const;
export const FRIEND_REQUESTS_KEY = ['friendRequests'] as const;
export const BLOCKED_KEY = ['blockedUsers'] as const;

export function useFriends() {
  return useQuery({
    queryKey: FRIENDS_KEY,
    queryFn: () => api<FriendDto[]>('/friends'),
    staleTime: 30_000, // актуальность держат события friends.updated и presence.update
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: FRIEND_REQUESTS_KEY,
    queryFn: () => api<FriendRequestDto[]>('/friends/requests'),
    staleTime: 30_000,
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: BLOCKED_KEY,
    queryFn: () => api<BlockedUserDto[]>('/friends/blocked'),
    staleTime: 30_000,
  });
}

/** Инвалидация всех «социальных» списков после мутации */
function useInvalidateFriends() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
    void queryClient.invalidateQueries({ queryKey: FRIEND_REQUESTS_KEY });
    void queryClient.invalidateQueries({ queryKey: BLOCKED_KEY });
  };
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (username: string) =>
      api<SendFriendRequestResultDto>('/friends/requests', {
        method: 'POST',
        body: { username },
      }),
    onSuccess: invalidate,
  });
}

export function useAcceptFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<void>(`/friends/requests/${requestId}/accept`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

/** Отклонить входящую или отменить исходящую заявку */
export function useDeleteFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<void>(`/friends/requests/${requestId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useRemoveFriend() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/friends/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useBlockUser() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/friends/blocked/${userId}`, { method: 'PUT' }),
    onSuccess: invalidate,
  });
}

export function useUnblockUser() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: (userId: string) => api<void>(`/friends/blocked/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
