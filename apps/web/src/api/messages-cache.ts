import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagesPageDto } from '@voxa/shared';

/** Сообщение в кэше; pending — оптимистичное, ещё не подтверждено сервером */
export type ChatMessage = MessageDto & { pending?: boolean };

type MessagesData = InfiniteData<MessagesPageDto>;

export function messagesKey(channelId: string): [string, string] {
  return ['messages', channelId];
}

/** Новое сообщение — в начало первой (самой свежей) страницы, с дедупликацией */
export function addMessage(queryClient: QueryClient, message: ChatMessage): void {
  queryClient.setQueryData<MessagesData>(messagesKey(message.channelId), (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return {
      ...data,
      pages: [
        { ...(first as MessagesPageDto), items: [message, ...(first as MessagesPageDto).items] },
        ...rest,
      ],
    };
  });
}

/**
 * Подтверждение оптимистичного сообщения: temp заменяется на настоящее.
 * Если настоящее уже пришло по WebSocket — temp просто удаляется.
 */
export function confirmMessage(
  queryClient: QueryClient,
  channelId: string,
  tempId: string,
  real: MessageDto,
): void {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) => {
    if (!data) return data;
    const alreadyHasReal = data.pages.some((p) => p.items.some((m) => m.id === real.id));
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items
          .filter((m) => !(m.id === tempId && alreadyHasReal))
          .map((m) => (m.id === tempId ? real : m)),
      })),
    };
  });
}

export function removeMessage(queryClient: QueryClient, channelId: string, id: string): void {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((m) => m.id !== id),
      })),
    };
  });
}
