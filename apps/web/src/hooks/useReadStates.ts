import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReadStateDto } from '@voxa/shared';
import { useEffect, useRef } from 'react';

import { api } from '../api/client';
import { READ_STATES_KEY, setReadState } from '../api/read-states-cache';

export function useReadStates() {
  return useQuery({
    queryKey: READ_STATES_KEY,
    queryFn: () => api<ReadStateDto[]>('/read-states'),
    staleTime: Infinity, // актуальность держат WebSocket и авто-ack
  });
}

/**
 * Авто-отметка прочитанного: пока канал открыт и вкладка видима, самое
 * свежее сообщение помечается прочитанным (с лёгким дебаунсом).
 */
export function useAutoAck(channelId: string, latestMessageId: string | undefined): void {
  const queryClient = useQueryClient();

  const ackMutation = useMutation({
    mutationFn: (messageId: string) =>
      api<ReadStateDto>(`/channels/${channelId}/ack`, {
        method: 'POST',
        body: { messageId },
      }),
    onSuccess: (state) => {
      setReadState(queryClient, state.channelId, state);
    },
  });

  // Свежие значения для отложенных вызовов (таймер, visibilitychange)
  const latest = useRef({ channelId, latestMessageId, mutate: ackMutation.mutate });
  latest.current = { channelId, latestMessageId, mutate: ackMutation.mutate };

  useEffect(() => {
    const tryAck = (): void => {
      const { channelId: chan, latestMessageId: messageId, mutate } = latest.current;
      if (!messageId || messageId.startsWith('temp-') || document.hidden) return;
      const states = queryClient.getQueryData<ReadStateDto[]>(READ_STATES_KEY);
      const state = states?.find((s) => s.channelId === chan);
      const alreadyRead =
        state &&
        state.mentionCount === 0 &&
        state.unreadCount === 0 &&
        state.lastReadMessageId !== null &&
        state.lastReadMessageId >= messageId;
      if (alreadyRead) return;
      mutate(messageId);
    };

    const timer = setTimeout(tryAck, 400);
    document.addEventListener('visibilitychange', tryAck);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tryAck);
    };
  }, [channelId, latestMessageId, queryClient]);
}
