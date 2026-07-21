import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagesPageDto, UserPublicDto } from '@voxa/shared';

/** Сообщение в кэше; pending — оптимистичное, ещё не подтверждено сервером */
export type ChatMessage = MessageDto & { pending?: boolean };

type MessagesData = InfiniteData<MessagesPageDto>;

export function messagesKey(channelId: string): [string, string] {
  return ['messages', channelId];
}

function mapPages(
  data: MessagesData | undefined,
  fn: (items: ChatMessage[]) => ChatMessage[],
): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })),
  };
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
    const alreadyHasReal = data?.pages.some((p) => p.items.some((m) => m.id === real.id)) ?? false;
    return mapPages(data, (items) =>
      items
        .filter((m) => !(m.id === tempId && alreadyHasReal))
        .map((m) => (m.id === tempId ? real : m)),
    );
  });
}

/** Замена сообщения по id (правка своя или пришедшая по WebSocket) */
export function updateMessage(queryClient: QueryClient, message: MessageDto): void {
  queryClient.setQueryData<MessagesData>(messagesKey(message.channelId), (data) =>
    mapPages(data, (items) => items.map((m) => (m.id === message.id ? { ...m, ...message } : m))),
  );
}

export function removeMessage(queryClient: QueryClient, channelId: string, id: string): void {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) =>
    mapPages(data, (items) => items.filter((m) => m.id !== id)),
  );
}

/** Смена профиля автора: обновить его имя во всех закэшированных сообщениях */
export function renameMessageAuthor(queryClient: QueryClient, user: UserPublicDto): void {
  queryClient.setQueriesData<MessagesData>({ queryKey: ['messages'] }, (data) =>
    mapPages(data, (items) =>
      items.map((m) =>
        m.author?.id === user.id
          ? {
              ...m,
              author: {
                ...m.author,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              },
            }
          : m,
      ),
    ),
  );
}

/** Добавление/снятие реакции (и оптимистично, и из WebSocket-события) */
export function applyReaction(
  queryClient: QueryClient,
  channelId: string,
  messageId: string,
  emoji: string,
  userId: string,
  kind: 'add' | 'remove',
): void {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) =>
    mapPages(data, (items) =>
      items.map((m) => {
        if (m.id !== messageId) return m;
        const exists = m.reactions.some((r) => r.emoji === emoji && r.userId === userId);
        if (kind === 'add') {
          if (exists) return m;
          return { ...m, reactions: [...m.reactions, { emoji, userId }] };
        }
        if (!exists) return m;
        return {
          ...m,
          reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId)),
        };
      }),
    ),
  );
}
