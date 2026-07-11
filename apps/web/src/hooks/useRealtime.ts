import { useQueryClient } from '@tanstack/react-query';
import {
  WsEvents,
  type MemberDto,
  type MessageDto,
  type PresenceUpdatePayload,
  type ReactionEventPayload,
  type ReadStateUpdatedPayload,
  type TypingPayload,
} from '@voxa/shared';
import { useEffect } from 'react';

import { refreshSession } from '../api/client';
import { addMessage, applyReaction, removeMessage, updateMessage } from '../api/messages-cache';
import { bumpUnread, setReadState } from '../api/read-states-cache';
import { connectSocket, disconnectSocket } from '../api/socket';
import { MEMBERS_KEY } from './useMembers';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';

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

    const socket = connectSocket(accessToken);
    const chat = useChatStore.getState();

    socket.on(WsEvents.MessageNew, (message: MessageDto) => {
      addMessage(queryClient, message);
      if (message.author) {
        useChatStore.getState().clearTypingUser(message.channelId, message.author.id);
      }
      // Чужое сообщение — плюс к непрочитанным; авто-ack открытого канала снимет
      const myId = useAuthStore.getState().user?.id;
      if (myId && message.author?.id !== myId) {
        bumpUnread(
          queryClient,
          message.channelId,
          message.mentionedUserIds?.includes(myId) ?? false,
        );
      }
    });

    socket.on(WsEvents.MessageEdited, (message: MessageDto) => {
      updateMessage(queryClient, message);
    });

    socket.on(WsEvents.MessageDeleted, ({ id, channelId }: { id: string; channelId: string }) => {
      removeMessage(queryClient, channelId, id);
    });

    socket.on(WsEvents.ReactionAdded, (p: ReactionEventPayload) => {
      applyReaction(queryClient, p.channelId, p.messageId, p.emoji, p.userId, 'add');
    });

    socket.on(WsEvents.ReactionRemoved, (p: ReactionEventPayload) => {
      applyReaction(queryClient, p.channelId, p.messageId, p.emoji, p.userId, 'remove');
    });

    socket.on(WsEvents.Typing, (p: TypingPayload) => {
      chat.markTyping(p.channelId, p.userId, p.username);
    });

    socket.on(WsEvents.PresenceUpdate, (p: PresenceUpdatePayload) => {
      queryClient.setQueryData<MemberDto[]>(MEMBERS_KEY, (members) =>
        members?.map((m) => (m.id === p.userId ? { ...m, status: p.status } : m)),
      );
    });

    // Ack из другой вкладки/устройства этого же пользователя
    socket.on(WsEvents.ReadStateUpdated, (p: ReadStateUpdatedPayload) => {
      setReadState(queryClient, p.channelId, {
        lastReadMessageId: p.lastReadMessageId,
        unreadCount: 0,
        mentionCount: 0,
      });
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
      disconnectSocket();
    };
  }, [accessToken, queryClient]);
}
