import { useQueryClient } from '@tanstack/react-query';
import { WsEvents, type MessageDto } from '@voxa/shared';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

import { refreshSession } from '../api/client';
import { addMessage } from '../api/messages-cache';
import { useAuthStore } from '../stores/auth';

/**
 * Единственное WebSocket-подключение приложения. Пересоздаётся при смене
 * access-токена (после refresh); при auth_error от сервера инициирует
 * refresh — обновлённый токен сам пересоздаст соединение через зависимость.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io('/', { auth: { token: accessToken } });

    socket.on(WsEvents.MessageNew, (message: MessageDto) => {
      addMessage(queryClient, message);
    });

    const invalidateStructure = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['structure'] });
    };
    socket.on(WsEvents.ChannelCreated, invalidateStructure);
    socket.on(WsEvents.ChannelUpdated, invalidateStructure);
    socket.on(WsEvents.ChannelDeleted, invalidateStructure);
    socket.on(WsEvents.CategoryCreated, invalidateStructure);
    socket.on(WsEvents.CategoryUpdated, invalidateStructure);
    socket.on(WsEvents.CategoryDeleted, invalidateStructure);

    socket.on('auth_error', () => {
      void refreshSession();
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, queryClient]);
}
