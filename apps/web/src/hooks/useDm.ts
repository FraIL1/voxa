import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DmConversationDto, DmMessageDto, DmMessagesPageDto } from '@voxa/shared';

import { api } from '../api/client';
import {
  addDmMessage,
  applyDmReaction,
  confirmDmMessage,
  DM_CONVERSATIONS_KEY,
  dmMessagesKey,
  removeDmMessage,
  updateDmMessage,
  type DmChatMessage,
} from '../api/dm-cache';
import { useAuthStore } from '../stores/auth';

export function useDmConversations() {
  return useQuery({
    queryKey: DM_CONVERSATIONS_KEY,
    queryFn: () => api<DmConversationDto[]>('/dm/conversations'),
    staleTime: 30_000,
  });
}

export function useOpenDm() {
  return useMutation({
    mutationFn: (userId: string) =>
      api<{ id: string }>('/dm/conversations', { method: 'POST', body: { userId } }),
  });
}

export function useDmMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: dmMessagesKey(conversationId),
    queryFn: ({ pageParam }) =>
      api<DmMessagesPageDto>(
        `/dm/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.items[lastPage.items.length - 1]?.id : undefined,
    staleTime: Infinity,
  });
}

export function useSendDm(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      replyToId,
      attachmentIds,
    }: {
      content: string;
      replyToId?: string;
      attachmentIds?: string[];
    }) =>
      api<DmMessageDto>(`/dm/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          content,
          ...(replyToId ? { replyToId } : {}),
          ...(attachmentIds?.length ? { attachmentIds } : {}),
        },
      }),
    onMutate: ({ content, replyToId }) => {
      const user = useAuthStore.getState().user;
      const temp: DmChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        conversationId,
        author: user
          ? {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            }
          : null,
        content,
        replyToId: replyToId ?? null,
        replyTo: null,
        attachments: [],
        reactions: [],
        pinnedAt: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      addDmMessage(queryClient, temp);
      return { tempId: temp.id };
    },
    onSuccess: (real, _vars, ctx) =>
      confirmDmMessage(queryClient, conversationId, ctx.tempId, real),
    onError: (_e, _vars, ctx) => ctx && removeDmMessage(queryClient, conversationId, ctx.tempId),
  });
}

export function useEditDm(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      api<DmMessageDto>(`/dm/conversations/${conversationId}/messages/${messageId}`, {
        method: 'PATCH',
        body: { content },
      }),
    onSuccess: (updated) => updateDmMessage(queryClient, updated),
  });
}

export function useDeleteDm(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`/dm/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: (_d, messageId) => removeDmMessage(queryClient, conversationId, messageId),
  });
}

/** Авто-отметка прочитанного при просмотре диалога */
export function useDmAck() {
  return useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      api<void>(`/dm/conversations/${conversationId}/ack`, { method: 'POST', body: { messageId } }),
  });
}

export function dmPinsKey(conversationId: string): readonly unknown[] {
  return ['dmPins', conversationId];
}

/** Поставить/снять реакцию (оптимистично, WS подтвердит обоим) */
export function useToggleDmReaction(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji, mine }: { messageId: string; emoji: string; mine: boolean }) =>
      api<void>(
        `/dm/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: mine ? 'DELETE' : 'PUT' },
      ),
    onMutate: ({ messageId, emoji, mine }) => {
      const myId = useAuthStore.getState().user?.id;
      if (myId) {
        applyDmReaction(
          queryClient,
          conversationId,
          messageId,
          emoji,
          myId,
          mine ? 'remove' : 'add',
        );
      }
    },
  });
}

/** Закреплённые сообщения диалога */
export function useDmPins(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: dmPinsKey(conversationId),
    queryFn: () => api<DmMessageDto[]>(`/dm/conversations/${conversationId}/pins`),
    enabled,
  });
}

/** Закрепить/открепить сообщение (видно обоим) */
export function useToggleDmPin(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      api<DmMessageDto>(`/dm/conversations/${conversationId}/messages/${messageId}/pin`, {
        method: pinned ? 'DELETE' : 'PUT',
      }),
    onSuccess: (message) => {
      updateDmMessage(queryClient, message);
      void queryClient.invalidateQueries({ queryKey: dmPinsKey(conversationId) });
    },
  });
}

/** Закрепить/открепить сам диалог в своём списке */
export function useToggleConversationPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, pinned }: { conversationId: string; pinned: boolean }) =>
      api<DmConversationDto>(`/dm/conversations/${conversationId}/pin`, {
        method: pinned ? 'DELETE' : 'PUT',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}

/** Поиск по переписке (запускается только при непустом запросе) */
export function useDmSearch(conversationId: string, query: string) {
  return useQuery({
    queryKey: ['dmSearch', conversationId, query],
    queryFn: () =>
      api<DmMessageDto[]>(
        `/dm/conversations/${conversationId}/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.trim().length > 0,
  });
}

// ---------- Группы ----------

export function useCreateGroupDm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; userIds: string[] }) =>
      api<DmConversationDto>('/dm/conversations/group', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}

export function useAddGroupMembers(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      api<DmConversationDto>(`/dm/conversations/${conversationId}/members`, {
        method: 'POST',
        body: { userIds },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}

export function useRemoveGroupMember(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/dm/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}

export function useRenameGroup(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<DmConversationDto>(`/dm/conversations/${conversationId}/name`, {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api<void>(`/dm/conversations/${conversationId}/leave`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DM_CONVERSATIONS_KEY }),
  });
}
