import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagesPageDto } from '@voxa/shared';

import { api } from '../api/client';
import {
  addMessage,
  confirmMessage,
  messagesKey,
  removeMessage,
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

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      api<MessageDto>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: { content },
      }),

    onMutate: (content) => {
      const user = useAuthStore.getState().user;
      const temp: ChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        channelId,
        author: user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl } : null,
        content,
        replyToId: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      addMessage(queryClient, temp);
      return { tempId: temp.id };
    },

    onSuccess: (real, _content, context) => {
      confirmMessage(queryClient, channelId, context.tempId, real);
    },

    onError: (_error, _content, context) => {
      if (context) removeMessage(queryClient, channelId, context.tempId);
    },
  });
}
