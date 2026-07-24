import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, MessageDto, MessagesPageDto } from '@voxa/shared';

import { useParams } from 'react-router';

import { api } from '../api/client';
import {
  addMessage,
  applyReaction,
  confirmMessage,
  messagesKey,
  removeMessage,
  updateMessage,
  type ChatMessage,
} from '../api/messages-cache';
import { useAuthStore } from '../stores/auth';

export function useMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: messagesKey(channelId),
    queryFn: ({ pageParam }) =>
      api<MessagesPageDto>(
        `/channels/${channelId}/messages${pageParam ? `?before=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.items[lastPage.items.length - 1]?.id : undefined,
    staleTime: Infinity, // актуальность держит WebSocket
  });
}

interface SendMessageVars {
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
  /** Уже загруженные вложения — для мгновенного оптимистичного рендера */
  attachments?: AttachmentDto[];
}

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();
  const { guildId = '' } = useParams<{ guildId: string }>();

  return useMutation({
    mutationFn: ({ content, replyToId, attachmentIds }: SendMessageVars) =>
      api<MessageDto>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: {
          content,
          ...(replyToId ? { replyToId } : {}),
          ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
        },
      }),

    onMutate: ({ content, replyToId, attachments }) => {
      const user = useAuthStore.getState().user;
      const temp: ChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        channelId,
        guildId,
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
        reactions: [],
        attachments: attachments ?? [],
        linkPreview: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      addMessage(queryClient, temp);
      return { tempId: temp.id };
    },

    onSuccess: (real, _vars, context) => {
      confirmMessage(queryClient, channelId, context.tempId, real);
    },

    onError: (_error, _vars, context) => {
      if (context) removeMessage(queryClient, channelId, context.tempId);
    },
  });
}

export function useEditMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      api<MessageDto>(`/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: { content },
      }),
    onSuccess: (updated) => {
      updateMessage(queryClient, updated);
    },
  });
}

export function useDeleteMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: (_data, messageId) => {
      removeMessage(queryClient, channelId, messageId);
    },
  });
}

/** Клик по реакции: снимает свою или ставит новую — оптимистично, с откатом */
export function useToggleReaction(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, emoji, mine }: { messageId: string; emoji: string; mine: boolean }) =>
      api<void>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: mine ? 'DELETE' : 'PUT' },
      ),

    onMutate: ({ messageId, emoji, mine }) => {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) return;
      applyReaction(queryClient, channelId, messageId, emoji, userId, mine ? 'remove' : 'add');
      return { userId };
    },

    onError: (_error, { messageId, emoji, mine }, context) => {
      if (!context) return;
      // откат оптимистичного изменения
      applyReaction(
        queryClient,
        channelId,
        messageId,
        emoji,
        context.userId,
        mine ? 'add' : 'remove',
      );
    },
  });
}
