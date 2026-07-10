import type { CategoryDto, ChannelDto, MessageDto } from './dto';

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

export interface WsServerEvents {
  [WsEvents.Ready]: WsReadyPayload;
  [WsEvents.MessageNew]: MessageDto;
  [WsEvents.MessageEdited]: MessageDto;
  [WsEvents.MessageDeleted]: { id: string; channelId: string };
  [WsEvents.ReactionAdded]: ReactionEventPayload;
  [WsEvents.ReactionRemoved]: ReactionEventPayload;
  [WsEvents.Typing]: TypingPayload;
  [WsEvents.ChannelCreated]: ChannelDto;
  [WsEvents.ChannelUpdated]: ChannelDto;
  [WsEvents.ChannelDeleted]: { id: string };
  [WsEvents.CategoryCreated]: CategoryDto;
  [WsEvents.CategoryUpdated]: CategoryDto;
  [WsEvents.CategoryDeleted]: { id: string };
}
