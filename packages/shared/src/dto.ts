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
  /** Активный таймаут: до этого момента нельзя писать и говорить */
  timedOutUntil: string | null;
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
  timedOutUntil: string | null;
  banned: boolean;
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

/** Участник голосового канала (видно всем ещё до входа — раздел 5.4 PRD) */
export interface VoiceParticipantDto {
  userId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
}

export interface VoiceChannelStateDto {
  channelId: string;
  participants: VoiceParticipantDto[];
}

/** Ответ POST /channels/:id/voice-token */
export interface VoiceTokenDto {
  /** WebSocket-адрес LiveKit для клиента */
  url: string;
  /** Подписанный JWT доступа в комнату */
  token: string;
  channelId: string;
}

// ---------- Модерация и панель владельца (раздел 5.10 PRD) ----------

export interface BanDto {
  userId: string;
  username: string;
  reason: string | null;
  bannedByUsername: string | null;
  createdAt: string;
}

export interface AuditEntryDto {
  /** BigInt сериализуется строкой */
  id: string;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPageDto {
  items: AuditEntryDto[];
  hasMore: boolean;
}

export interface AdminOverviewDto {
  usersTotal: number;
  onlineNow: number;
  activeSessions: number;
  /** Суммарный размер загруженных файлов, МБ */
  filesTotalMb: number;
  serverVersion: string;
  uptimeSeconds: number;
}

// ---------- Личные сообщения (раздел 5.6 PRD) ----------

export interface DmMessageDto {
  id: string;
  conversationId: string;
  author: UserPublicDto | null;
  content: string;
  replyToId: string | null;
  replyTo: ReplyPreviewDto | null;
  attachments: AttachmentDto[];
  editedAt: string | null;
  createdAt: string;
}

export interface DmMessagesPageDto {
  items: DmMessageDto[];
  hasMore: boolean;
}

/** Диалог в списке: собеседник + превью последнего сообщения + непрочитанные */
export interface DmConversationDto {
  id: string;
  peer: UserPublicDto;
  lastMessage: {
    content: string;
    authorId: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

/** Друг (принятая дружба) со статусом присутствия */
export interface FriendDto extends UserPublicDto {
  status: PresenceStatus;
}

/** Заявка в друзья глазами запрашивающего пользователя */
export interface FriendRequestDto {
  id: string;
  direction: 'incoming' | 'outgoing';
  user: UserPublicDto;
  createdAt: string;
}

/** Результат отправки заявки: могла сразу стать дружбой (встречная заявка) */
export interface SendFriendRequestResultDto {
  requestId: string;
  autoAccepted: boolean;
}

export interface BlockedUserDto extends UserPublicDto {
  blockedAt: string;
}
