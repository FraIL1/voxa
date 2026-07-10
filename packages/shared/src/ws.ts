import type { CategoryDto, ChannelDto, MessageDto } from './dto';

/** События WebSocket (раздел 8.5 PRD). Сервер → клиент. */
export const WsEvents = {
  /** Отправляется клиенту сразу после подключения */
  Ready: 'ready',
  MessageNew: 'message.new',
  ChannelCreated: 'channel.created',
  ChannelUpdated: 'channel.updated',
  ChannelDeleted: 'channel.deleted',
  CategoryCreated: 'category.created',
  CategoryUpdated: 'category.updated',
  CategoryDeleted: 'category.deleted',
} as const;

export type WsEventName = (typeof WsEvents)[keyof typeof WsEvents];

export interface WsReadyPayload {
  userId: string;
  /** Каналы, на события которых подписан сокет */
  channelIds: string[];
}

export interface WsServerEvents {
  [WsEvents.Ready]: WsReadyPayload;
  [WsEvents.MessageNew]: MessageDto;
  [WsEvents.ChannelCreated]: ChannelDto;
  [WsEvents.ChannelUpdated]: ChannelDto;
  [WsEvents.ChannelDeleted]: { id: string };
  [WsEvents.CategoryCreated]: CategoryDto;
  [WsEvents.CategoryUpdated]: CategoryDto;
  [WsEvents.CategoryDeleted]: { id: string };
}
