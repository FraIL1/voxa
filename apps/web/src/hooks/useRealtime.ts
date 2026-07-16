import { useQueryClient } from '@tanstack/react-query';
import {
  WsEvents,
  type MemberDto,
  type MessageDto,
  type PresenceUpdatePayload,
  type ReactionEventPayload,
  type ReadStateUpdatedPayload,
  type TypingPayload,
  type UserPublicDto,
  type VoiceChannelStateDto,
} from '@voxa/shared';
import { useEffect } from 'react';

import { refreshSession } from '../api/client';
import {
  addMessage,
  applyReaction,
  removeMessage,
  renameMessageAuthor,
  updateMessage,
} from '../api/messages-cache';
import { bumpUnread, setReadState } from '../api/read-states-cache';
import { connectSocket, disconnectSocket, emitVoiceState } from '../api/socket';
import { playJoinSound, playLeaveSound } from '../lib/sounds';
import { MEMBERS_KEY } from './useMembers';
import { VOICE_STATES_KEY } from './useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { currentVoiceState } from '../stores/voice';

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

    socket.on(WsEvents.VoiceUpdate, (update: VoiceChannelStateDto) => {
      // Звуки входа/выхода других участников МОЕГО канала
      const myId = useAuthStore.getState().user?.id;
      const myChannel = currentVoiceState().channelId;
      const previous = queryClient.getQueryData<VoiceChannelStateDto[]>(VOICE_STATES_KEY);
      if (myChannel && update.channelId === myChannel && previous) {
        const before = new Set(
          (previous.find((s) => s.channelId === update.channelId)?.participants ?? []).map(
            (p) => p.userId,
          ),
        );
        const after = new Set(update.participants.map((p) => p.userId));
        if ([...after].some((id) => !before.has(id) && id !== myId)) playJoinSound();
        else if ([...before].some((id) => !after.has(id) && id !== myId)) playLeaveSound();
      }

      queryClient.setQueryData<VoiceChannelStateDto[]>(VOICE_STATES_KEY, (data) => {
        const rest = (data ?? []).filter((s) => s.channelId !== update.channelId);
        return update.participants.length > 0 ? [...rest, update] : rest;
      });
    });

    // Реконнект (например, после refresh токена): восстановить состояние голоса
    socket.on('connect', () => {
      const voice = currentVoiceState();
      if (voice.channelId) emitVoiceState(voice);
    });

    socket.on(WsEvents.PresenceUpdate, (p: PresenceUpdatePayload) => {
      queryClient.setQueryData<MemberDto[]>(MEMBERS_KEY, (members) =>
        members?.map((m) => (m.id === p.userId ? { ...m, status: p.status } : m)),
      );
    });

    // Смена профиля: список участников, авторы сообщений, своя сессия в других вкладках
    socket.on(WsEvents.UserUpdated, (u: UserPublicDto) => {
      queryClient.setQueryData<MemberDto[]>(MEMBERS_KEY, (members) =>
        members?.map((m) =>
          m.id === u.id ? { ...m, username: u.username, avatarUrl: u.avatarUrl } : m,
        ),
      );
      renameMessageAuthor(queryClient, u);
      const me = useAuthStore.getState().user;
      if (me && me.id === u.id && me.username !== u.username) {
        useAuthStore.getState().setUser({ ...me, username: u.username });
      }
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
