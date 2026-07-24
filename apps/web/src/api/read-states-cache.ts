import type { QueryClient } from '@tanstack/react-query';
import type { ReadStateDto } from '@voxa/shared';

export const READ_STATES_KEY = ['readStates'] as const;

export function setReadState(
  queryClient: QueryClient,
  channelId: string,
  patch: Partial<Omit<ReadStateDto, 'channelId'>>,
): void {
  queryClient.setQueryData<ReadStateDto[]>(READ_STATES_KEY, (data) => {
    if (!data) return data;
    const exists = data.some((s) => s.channelId === channelId);
    if (!exists) {
      return [
        ...data,
        {
          channelId,
          lastReadMessageId: null,
          unreadCount: 0,
          mentionCount: 0,
          muted: false,
          ...patch,
        },
      ];
    }
    return data.map((s) => (s.channelId === channelId ? { ...s, ...patch } : s));
  });
}

/** Новое чужое сообщение: +1 непрочитанное (и упоминание, если адресовано мне) */
export function bumpUnread(queryClient: QueryClient, channelId: string, mentioned: boolean): void {
  queryClient.setQueryData<ReadStateDto[]>(READ_STATES_KEY, (data) => {
    if (!data) return data;
    const exists = data.some((s) => s.channelId === channelId);
    const base: ReadStateDto = {
      channelId,
      lastReadMessageId: null,
      unreadCount: 0,
      mentionCount: 0,
      muted: false,
    };
    const list = exists ? data : [...data, base];
    return list.map((s) =>
      s.channelId === channelId
        ? {
            ...s,
            unreadCount: s.unreadCount + 1,
            mentionCount: s.mentionCount + (mentioned ? 1 : 0),
          }
        : s,
    );
  });
}
