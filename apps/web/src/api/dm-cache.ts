import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  DmConversationDto,
  DmMessageDto,
  DmMessagesPageDto,
  UserPublicDto,
} from '@voxa/shared';

export type DmChatMessage = DmMessageDto & { pending?: boolean };

type DmData = InfiniteData<DmMessagesPageDto>;

export function dmMessagesKey(conversationId: string): [string, string] {
  return ['dmMessages', conversationId];
}

export const DM_CONVERSATIONS_KEY = ['dmConversations'] as const;

function mapPages(
  data: DmData | undefined,
  fn: (items: DmChatMessage[]) => DmChatMessage[],
): DmData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) };
}

export function addDmMessage(queryClient: QueryClient, message: DmChatMessage): void {
  queryClient.setQueryData<DmData>(dmMessagesKey(message.conversationId), (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return {
      ...data,
      pages: [
        {
          ...(first as DmMessagesPageDto),
          items: [message, ...(first as DmMessagesPageDto).items],
        },
        ...rest,
      ],
    };
  });
}

export function confirmDmMessage(
  queryClient: QueryClient,
  conversationId: string,
  tempId: string,
  real: DmMessageDto,
): void {
  queryClient.setQueryData<DmData>(dmMessagesKey(conversationId), (data) => {
    const hasReal = data?.pages.some((p) => p.items.some((m) => m.id === real.id)) ?? false;
    return mapPages(data, (items) =>
      items.filter((m) => !(m.id === tempId && hasReal)).map((m) => (m.id === tempId ? real : m)),
    );
  });
}

export function updateDmMessage(queryClient: QueryClient, message: DmMessageDto): void {
  queryClient.setQueryData<DmData>(dmMessagesKey(message.conversationId), (data) =>
    mapPages(data, (items) => items.map((m) => (m.id === message.id ? { ...m, ...message } : m))),
  );
}

export function removeDmMessage(
  queryClient: QueryClient,
  conversationId: string,
  id: string,
): void {
  queryClient.setQueryData<DmData>(dmMessagesKey(conversationId), (data) =>
    mapPages(data, (items) => items.filter((m) => m.id !== id)),
  );
}

/** Смена профиля: обновляем автора во всех открытых диалогах и превью собеседника */
export function renameDmAuthor(queryClient: QueryClient, user: UserPublicDto): void {
  queryClient.setQueriesData<DmData>({ queryKey: ['dmMessages'] }, (data) =>
    mapPages(data, (items) =>
      items.map((m) =>
        m.author?.id === user.id
          ? {
              ...m,
              author: {
                ...m.author,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              },
            }
          : m,
      ),
    ),
  );
  // Собеседник/участники в списке диалогов
  queryClient.setQueryData<DmConversationDto[]>(DM_CONVERSATIONS_KEY, (list) =>
    list?.map((c) => {
      const patch = (u: UserPublicDto): UserPublicDto =>
        u.id === user.id ? { ...u, displayName: user.displayName, avatarUrl: user.avatarUrl } : u;
      return {
        ...c,
        peer: c.peer ? patch(c.peer) : null,
        members: c.members.map(patch),
      };
    }),
  );
}

/** Реакция пришла по WS: правим сообщение в открытом диалоге */
export function applyDmReaction(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
  action: 'add' | 'remove',
): void {
  queryClient.setQueryData<DmData>(dmMessagesKey(conversationId), (data) =>
    mapPages(data, (items) =>
      items.map((m) => {
        if (m.id !== messageId) return m;
        const has = m.reactions.some((r) => r.emoji === emoji && r.userId === userId);
        if (action === 'add') {
          if (has) return m;
          return { ...m, reactions: [...m.reactions, { emoji, userId }] };
        }
        if (!has) return m;
        return {
          ...m,
          reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId)),
        };
      }),
    ),
  );
}

/** Заголовок диалога: имя группы или отображаемое имя собеседника */
export function dmTitle(c: DmConversationDto): string {
  if (c.isGroup) return c.name ?? 'Группа';
  return c.peer?.displayName ?? 'Личный диалог';
}

/** Буква для аватара диалога */
export function dmAvatarLetter(c: DmConversationDto): string {
  return dmTitle(c).slice(0, 1).toUpperCase();
}
