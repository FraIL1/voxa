import type {
  CategoryDto,
  ChannelDto,
  DmConversationDto,
  DmMessageDto,
  FriendRequestDto,
  MessageDto,
  PresenceStatus,
  UserPublicDto,
  VoiceChannelStateDto,
} from './dto';

/** События WebSocket (раздел 8.5 PRD). Сервер → клиент. */
export const WsEvents = {
  /** Отправляется клиенту сразу после подключения */
  Ready: 'ready',
  MessageNew: 'message.new',
  MessageEdited: 'message.edit',
  MessageDeleted: 'message.delete',
  ReactionAdded: 'reaction.add',
  ReactionRemoved: 'reaction.remove',
  Typing: 'typing',
  PresenceUpdate: 'presence.update',
  /** Профиль пользователя изменился (имя/аватар) — обновить кэши */
  UserUpdated: 'user.updated',
  /** Адресное: сессия принудительно завершена (кик/бан) — выйти из аккаунта */
  ForceLogout: 'force_logout',
  /** Адресное: изменился мой таймаут (null — снят) */
  MeTimedOut: 'me.timeout',
  /** Изменение состава/состояния участников голосового канала */
  VoiceUpdate: 'voice.update',
  /** Адресное событие: синхронизация прочитанности между вкладками/устройствами */
  ReadStateUpdated: 'readstate.update',
  ChannelCreated: 'channel.created',
  ChannelUpdated: 'channel.updated',
  ChannelDeleted: 'channel.deleted',
  CategoryCreated: 'category.created',
  CategoryUpdated: 'category.updated',
  CategoryDeleted: 'category.deleted',
  /** Личные сообщения (адресные — обоим участникам диалога) */
  DmMessageNew: 'dm.message.new',
  DmMessageEdited: 'dm.message.edit',
  DmMessageDeleted: 'dm.message.delete',
  /** Диалог создан/поднялся в списке (обновить превью и порядок) */
  DmConversationUpdated: 'dm.conversation.updated',
  /** Адресное: пришла новая заявка в друзья */
  FriendRequestNew: 'friend.request.new',
  /** Адресное: состав друзей/заявок/блокировок изменился — перечитать списки */
  FriendsUpdated: 'friends.updated',
  /** Комнате сервера: состав участников изменился — перечитать список */
  GuildMembersChanged: 'guild.members.changed',
  /** Комнате сервера: профиль сервера (имя/иконка) изменился */
  GuildUpdated: 'guild.updated',
  /** Комнате сервера: роли изменились — перечитать список ролей и участников */
  GuildRolesChanged: 'guild.roles.changed',
  /** Адресное: мой список серверов изменился (создал/вступил/кик/бан) */
  MeGuildsChanged: 'me.guilds',
} as const;

export type WsEventName = (typeof WsEvents)[keyof typeof WsEvents];

/** События клиент → сервер */
export const WsClientEvents = {
  Typing: 'typing',
  /** Вход/выход/мьют в голосовом канале (см. voiceStateSchema) */
  VoiceState: 'voice.state',
} as const;

export interface WsReadyPayload {
  userId: string;
  /** Каналы, на события которых подписан сокет */
  channelIds: string[];
}

export interface ReactionEventPayload {
  channelId: string;
  messageId: string;
  emoji: string;
  userId: string;
}

export interface TypingPayload {
  channelId: string;
  userId: string;
  username: string;
}

export interface PresenceUpdatePayload {
  userId: string;
  status: PresenceStatus;
}

export interface ReadStateUpdatedPayload {
  channelId: string;
  lastReadMessageId: string | null;
}

export interface WsServerEvents {
  [WsEvents.Ready]: WsReadyPayload;
  [WsEvents.MessageNew]: MessageDto;
  [WsEvents.MessageEdited]: MessageDto;
  [WsEvents.MessageDeleted]: { id: string; channelId: string };
  [WsEvents.ReactionAdded]: ReactionEventPayload;
  [WsEvents.ReactionRemoved]: ReactionEventPayload;
  [WsEvents.Typing]: TypingPayload;
  [WsEvents.PresenceUpdate]: PresenceUpdatePayload;
  [WsEvents.UserUpdated]: UserPublicDto;
  [WsEvents.ForceLogout]: { reason: string };
  [WsEvents.MeTimedOut]: { until: string | null };
  [WsEvents.VoiceUpdate]: VoiceChannelStateDto;
  [WsEvents.ReadStateUpdated]: ReadStateUpdatedPayload;
  [WsEvents.ChannelCreated]: ChannelDto;
  [WsEvents.ChannelUpdated]: ChannelDto;
  [WsEvents.ChannelDeleted]: { id: string };
  [WsEvents.CategoryCreated]: CategoryDto;
  [WsEvents.CategoryUpdated]: CategoryDto;
  [WsEvents.CategoryDeleted]: { id: string };
  [WsEvents.DmMessageNew]: DmMessageDto;
  [WsEvents.DmMessageEdited]: DmMessageDto;
  [WsEvents.DmMessageDeleted]: { id: string; conversationId: string };
  [WsEvents.DmConversationUpdated]: DmConversationDto;
  [WsEvents.FriendRequestNew]: FriendRequestDto;
  [WsEvents.FriendsUpdated]: { reason: FriendsUpdateReason };
  [WsEvents.GuildMembersChanged]: { guildId: string };
  [WsEvents.GuildUpdated]: { guildId: string };
  [WsEvents.GuildRolesChanged]: { guildId: string };
  [WsEvents.MeGuildsChanged]: Record<string, never>;
}

export type FriendsUpdateReason =
  'request' | 'accepted' | 'declined' | 'removed' | 'blocked' | 'unblocked';
