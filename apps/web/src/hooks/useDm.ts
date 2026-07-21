import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DmConversationDto, DmMessageDto, DmMessagesPageDto } from '@voxa/shared';

import { api } from '../api/client';
import {
  addDmMessage,
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
