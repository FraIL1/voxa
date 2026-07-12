import type {
  CategoryDto,
  ChannelDto,
  MessageDto,
  PresenceStatus,
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
  [WsEvents.VoiceUpdate]: VoiceChannelStateDto;
  [WsEvents.ReadStateUpdated]: ReadStateUpdatedPayload;
  [WsEvents.ChannelCreated]: ChannelDto;
  [WsEvents.ChannelUpdated]: ChannelDto;
  [WsEvents.ChannelDeleted]: { id: string };
  [WsEvents.CategoryCreated]: CategoryDto;
  [WsEvents.CategoryUpdated]: CategoryDto;
  [WsEvents.CategoryDeleted]: { id: string };
}
