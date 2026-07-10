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
  editedAt: string | null;
  createdAt: string;
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
