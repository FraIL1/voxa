import { useQueryClient } from '@tanstack/react-query';
import {
  WsEvents,
  type DmConversationDto,
  type DmMessageDto,
  type DmCallEndReason,
  type DmCallIncomingPayload,
  type DmReactionEventPayload,
  type FriendDto,
  type FriendRequestDto,
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
import {
  addDmMessage,
  applyDmReaction,
  DM_CONVERSATIONS_KEY,
  removeDmMessage,
  renameDmAuthor,
  updateDmMessage,
} from '../api/dm-cache';
import { bumpUnread, setReadState } from '../api/read-states-cache';
import { connectSocket, disconnectSocket, emitVoiceState } from '../api/socket';
import { notify } from '../lib/notify';
import { playJoinSound, playLeaveSound } from '../lib/sounds';
import { BLOCKED_KEY, FRIEND_REQUESTS_KEY, FRIENDS_KEY } from './useFriends';
import { GUILDS_KEY } from './useGuilds';
import { MEMBERS_KEY } from './useMembers';
import { VOICE_STATES_KEY } from './useVoiceStates';
import { useAuthStore } from '../stores/auth';
import { useCallStore } from '../stores/call';
import { useChatStore } from '../stores/chat';
import { currentVoiceState, useVoiceStore } from '../stores/voice';

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
        const mentioned = message.mentionedUserIds?.includes(myId) ?? false;
        bumpUnread(queryClient, message.channelId, mentioned);

        // Нативное уведомление об упоминании, когда окно не на виду (раздел 5.8 PRD)
        if (mentioned && document.hidden) {
          void notify(message.author?.username ?? 'Voxa', message.content.slice(0, 120) || '…');
        }
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

    // Реконнект (например, после refresh токена): восстановить состояние
    // голоса и обновить снапшоты, которые могли устареть за время разрыва
    socket.on('connect', () => {
      const voice = currentVoiceState();
      if (voice.channelId) emitVoiceState(voice);
      void queryClient.invalidateQueries({ queryKey: VOICE_STATES_KEY });
      void queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
    });

    socket.on(WsEvents.PresenceUpdate, (p: PresenceUpdatePayload) => {
      queryClient.setQueryData<MemberDto[]>(MEMBERS_KEY, (members) =>
        members?.map((m) => (m.id === p.userId ? { ...m, status: p.status } : m)),
      );
      queryClient.setQueryData<FriendDto[]>(FRIENDS_KEY, (friends) =>
        friends?.map((f) => (f.id === p.userId ? { ...f, status: p.status } : f)),
      );
    });

    // Смена профиля: список участников, авторы сообщений, своя сессия в других вкладках
    socket.on(WsEvents.UserUpdated, (u: UserPublicDto) => {
      queryClient.setQueriesData<MemberDto[]>({ queryKey: MEMBERS_KEY }, (members) =>
        members?.map((m) =>
          m.id === u.id ? { ...m, displayName: u.displayName, avatarUrl: u.avatarUrl } : m,
        ),
      );
      queryClient.setQueryData<FriendDto[]>(FRIENDS_KEY, (friends) =>
        friends?.map((f) =>
          f.id === u.id ? { ...f, displayName: u.displayName, avatarUrl: u.avatarUrl } : f,
        ),
      );
      renameMessageAuthor(queryClient, u);
      renameDmAuthor(queryClient, u);
      const me = useAuthStore.getState().user;
      if (me && me.id === u.id && me.displayName !== u.displayName) {
        useAuthStore.getState().setUser({ ...me, displayName: u.displayName });
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

    socket.on(WsEvents.GuildMembersChanged, ({ guildId }: { guildId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['members', guildId] });
    });
    socket.on(WsEvents.GuildUpdated, () => {
      void queryClient.invalidateQueries({ queryKey: GUILDS_KEY });
    });
    socket.on(WsEvents.GuildRolesChanged, ({ guildId }: { guildId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['roles', guildId] });
      void queryClient.invalidateQueries({ queryKey: GUILDS_KEY });
    });
    socket.on(WsEvents.MeGuildsChanged, () => {
      void queryClient.invalidateQueries({ queryKey: GUILDS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['structure'] });
    });

    socket.on('auth_error', () => {
      void refreshSession();
    });

    // Кик/бан: сервер уже отозвал сессии — выходим из голоса и показываем причину
    socket.on(WsEvents.ForceLogout, ({ reason }: { reason: string }) => {
      void useVoiceStore
        .getState()
        .leave()
        .catch(() => undefined);
      useAuthStore.getState().clearSession(reason);
    });

    // Личные сообщения
    socket.on(WsEvents.DmMessageNew, (message: DmMessageDto) => {
      addDmMessage(queryClient, message);
      const myId = useAuthStore.getState().user?.id;
      // Уведомление, если пришло от собеседника и окно скрыто (раздел 5.8 PRD)
      if (myId && message.author?.id !== myId && document.hidden) {
        void notify(message.author?.username ?? 'Voxa', message.content.slice(0, 120) || '…');
      }
    });
    socket.on(WsEvents.DmMessageEdited, (message: DmMessageDto) => {
      updateDmMessage(queryClient, message);
    });
    socket.on(
      WsEvents.DmMessageDeleted,
      ({ id, conversationId }: { id: string; conversationId: string }) => {
        removeDmMessage(queryClient, conversationId, id);
      },
    );
    socket.on(WsEvents.DmReactionAdded, (p: DmReactionEventPayload) => {
      applyDmReaction(queryClient, p.conversationId, p.messageId, p.emoji, p.userId, 'add');
    });
    socket.on(WsEvents.DmReactionRemoved, (p: DmReactionEventPayload) => {
      applyDmReaction(queryClient, p.conversationId, p.messageId, p.emoji, p.userId, 'remove');
    });

    socket.on(WsEvents.DmCallIncoming, (payload: DmCallIncomingPayload) => {
      useCallStore.getState().onIncoming(payload);
    });
    socket.on(WsEvents.DmCallAccepted, () => {
      useCallStore.getState().onAccepted();
    });
    socket.on(
      WsEvents.DmCallEnded,
      ({ conversationId, reason }: { conversationId: string; reason: DmCallEndReason }) => {
        useCallStore.getState().onEnded(conversationId, reason);
      },
    );

    socket.on(WsEvents.DmConversationUpdated, (conv: DmConversationDto) => {
      queryClient.setQueryData<DmConversationDto[]>(DM_CONVERSATIONS_KEY, (list) => {
        const rest = (list ?? []).filter((c) => c.id !== conv.id);
        return [conv, ...rest].sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        );
      });
    });

    // Друзья: новая заявка — уведомление; любое изменение — перечитать списки
    socket.on(WsEvents.FriendRequestNew, (request: FriendRequestDto) => {
      if (document.hidden) {
        void notify('Voxa', `${request.user.username}: заявка в друзья`);
      }
    });
    socket.on(WsEvents.FriendsUpdated, () => {
      void queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
      void queryClient.invalidateQueries({ queryKey: FRIEND_REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: BLOCKED_KEY });
    });

    // Таймаут выдан или снят
    socket.on(
      WsEvents.MeTimedOut,
      ({ guildId, until }: { guildId: string; until: string | null }) => {
        void queryClient.invalidateQueries({ queryKey: ['members', guildId] });
        if (until) {
          // Модалка по центру + принудительный мут, если сидим в голосе
          useChatStore.getState().setTimeoutNotice(until);
          void useVoiceStore.getState().forceMuteLocal();
        }
      },
    );

    return () => {
      disconnectSocket();
    };
  }, [accessToken, queryClient]);
}
