import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { DmMessageDto, DmMessagesPageDto } from '@voxa/shared';

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
