/** DTO, которыми обмениваются сервер и клиенты (REST и WebSocket). */

export interface UserPublicDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface RoleDto {
  id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  isDefault: boolean;
  isOwnerRole: boolean;
}

export interface MeDto extends UserPublicDto {
  /** Итоговая маска прав (все роли через OR) */
  permissions: number;
  roles: RoleDto[];
  createdAt: string;
}

export interface AuthResponseDto {
  accessToken: string;
  user: MeDto;
}

export type ChannelType = 'TEXT' | 'VOICE';

export interface ChannelDto {
  id: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  categoryId: string | null;
  position: number;
  isPrivate: boolean;
  /** Только для приватных каналов: роли, которым канал виден */
  allowedRoleIds: string[];
}

export interface CategoryDto {
  id: string;
  name: string;
  position: number;
  channels: ChannelDto[];
}

/** Ответ GET /api/channels: полная структура сообщества */
export interface CommunityStructureDto {
  categories: CategoryDto[];
  /** Каналы вне категорий */
  uncategorized: ChannelDto[];
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  /** Только для изображений */
  width: number | null;
  height: number | null;
  kind: AttachmentKind;
  /** Подписанная ссылка (истекает; клиент не должен её кэшировать надолго) */
  url: string;
  /** Миниатюра (только изображения) */
  thumbUrl: string | null;
}

/** Предпросмотр первой ссылки сообщения (OG-теги) */
export interface LinkPreviewDto {
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export interface ReactionDto {
  emoji: string;
  userId: string;
}

/** Короткое превью сообщения, на которое отвечают */
export interface ReplyPreviewDto {
  id: string;
  authorUsername: string | null;
  /** Первые ~140 символов оригинала; null — оригинал удалён */
  excerpt: string | null;
}

export interface MessageDto {
  id: string;
  channelId: string;
  author: UserPublicDto | null;
  content: string;
  replyToId: string | null;
  replyTo: ReplyPreviewDto | null;
  reactions: ReactionDto[];
  attachments: AttachmentDto[];
  linkPreview: LinkPreviewDto | null;
  editedAt: string | null;
  createdAt: string;
  /** Кого упоминает сообщение; присутствует только в WS-событии message.new */
  mentionedUserIds?: string[];
}

export type PresenceStatus = 'online' | 'offline';

/** Роль в списке участников (без маски прав) */
export interface MemberRoleDto {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface MemberDto extends UserPublicDto {
  status: PresenceStatus;
  /** По убыванию старшинства */
  roles: MemberRoleDto[];
}

/** Состояние прочитанности канала для текущего пользователя */
export interface ReadStateDto {
  channelId: string;
  lastReadMessageId: string | null;
  unreadCount: number;
  mentionCount: number;
}

export interface MessagesPageDto {
  items: MessageDto[];
  hasMore: boolean;
}

export interface InviteDto {
  id: string;
  code: string;
  url: string;
  createdBy: UserPublicDto | null;
  grantsRoleName: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  isActive: boolean;
}
