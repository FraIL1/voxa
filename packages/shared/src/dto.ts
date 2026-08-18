/** DTO, которыми обмениваются сервер и клиенты (REST и WebSocket). */

export interface UserPublicDto {
  id: string;
  /** Неизменяемый уникальный логин (@handle) */
  username: string;
  /** Отображаемое имя (свободно меняется) */
  displayName: string;
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
  /** Скольким людям выдана роль */
  memberCount: number;
}

export interface MeDto extends UserPublicDto {
  /** Владелец всего приложения — видит глобальную панель */
  isInstanceOwner: boolean;
  /** Выбранный режим присутствия */
  presenceMode: PresenceMode;
  statusText: string | null;
  /** Рассказ о себе в карточке профиля */
  bio: string | null;
  /** Акцентный цвет профиля (#rrggbb); null — фирменный цвет приложения */
  accentColor: string | null;
  createdAt: string;
}

/** Как связан со мной человек, чью карточку я открыл */
export type ProfileRelation = 'self' | 'friends' | 'incoming' | 'outgoing' | 'none';

/** Публичная карточка пользователя (профиль глазами другого) */
export interface UserProfileDto extends UserPublicDto {
  bio: string | null;
  statusText: string | null;
  /** Моя заметка об этом человеке — видна только мне */
  myNote: string | null;
  /** Как я его называю; null — обычное отображаемое имя */
  myAlias: string | null;
  accentColor: string | null;
  /** Дата регистрации в приложении */
  createdAt: string;
  status: PresenceStatus;
  isInstanceOwner: boolean;
  relation: ProfileRelation;
  /** Я его заблокировал */
  blocked: boolean;
  /** Серверы, где мы оба состоим */
  mutualGuilds: { id: string; name: string; iconUrl: string | null }[];
  /** Сколько общих друзей */
  mutualFriends: number;
}

export interface AuthResponseDto {
  accessToken: string;
  user: MeDto;
}

export type ChannelType = 'TEXT' | 'VOICE';

export interface ChannelDto {
  id: string;
  guildId: string;
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
  guildId: string;
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

/** Сервер (guild) глазами запрашивающего участника */
/** Что уведомлять на сервере */
export type NotifyMode = 'ALL' | 'MENTIONS' | 'NONE';

/** Как попасть на сервер */
export type GuildJoinMode = 'INVITE_ONLY' | 'REQUEST' | 'PUBLIC';

export interface GuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  joinMode: GuildJoinMode;
  ownerId: string | null;
  /** Маска прав запрашивающего на этом сервере (владелец = все права) */
  myPermissions: number;
  /** Мои уведомления с этого сервера */
  myNotifyMode: NotifyMode;
  createdAt: string;
}

/** Сервер в витрине: то, что видно НЕ участнику */
export interface DiscoverGuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  joinMode: GuildJoinMode;
  members: number;
  /** Я уже отправил заявку на вступление */
  requested: boolean;
}

/** Заявка на вступление глазами модератора */
export interface GuildJoinRequestDto {
  user: UserPublicDto;
  message: string | null;
  createdAt: string;
}

/** Результат попытки вступить: сразу внутри или заявка отправлена */
export interface JoinAttemptResultDto {
  status: 'joined' | 'requested';
  guildId: string;
}

export interface JoinGuildResultDto {
  guildId: string;
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
  /** Сервер, которому принадлежит канал (нужен для настроек уведомлений) */
  guildId: string;
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

/** Что видят другие. «Невидимка» снаружи неотличима от офлайна */
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** Что человек выбрал сам в меню статуса */
export type PresenceMode = 'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE';

/** Роль в списке участников (без маски прав) */
export interface MemberRoleDto {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface MemberDto extends UserPublicDto {
  status: PresenceStatus;
  /** Своя строчка статуса под ником */
  statusText: string | null;
  /** Ник на сервере; null — показывается displayName */
  nickname: string | null;
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
  /** Канал заглушён лично мной */
  muted: boolean;
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
  grantsRoleId: string | null;
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
  /** Показывает экран прямо сейчас */
  sharing: boolean;
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
  reactions: ReactionDto[];
  /** Закреплено в диалоге (видно обоим) */
  pinnedAt: string | null;
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

/** Диалог в списке: 1-на-1 (peer) или группа (name + members) */
export interface DmConversationDto {
  id: string;
  isGroup: boolean;
  /** Название группы; для 1-на-1 — null */
  name: string | null;
  /** Собеседник в 1-на-1; для группы — null */
  peer: UserPublicDto | null;
  /** Все участники (в 1-на-1 — оба, включая себя) */
  members: UserPublicDto[];
  /** Владелец группы (кто может звать/убирать/переименовывать); null для 1-на-1 */
  ownerId: string | null;
  lastMessage: {
    content: string;
    authorId: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
  /** Закреплён ли диалог лично у меня (такие идут сверху списка) */
  pinned: boolean;
  /** Уведомления заглушены до этого момента; null — звучит как обычно */
  mutedUntil: string | null;
}

/** Друг (принятая дружба) со статусом присутствия */
export interface FriendDto extends UserPublicDto {
  status: PresenceStatus;
  statusText: string | null;
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

/** Публичная проверка инвайта: имя сервера для страницы приглашения */
export interface InviteCheckDto {
  valid: boolean;
  guildName: string | null;
}

// ---------- Панель владельца приложения ----------

/** Пользователь глазами владельца инстанса */
export interface InstanceUserDto extends UserPublicDto {
  status: PresenceStatus;
  /** Сколько серверов создал и в скольких состоит */
  guildsOwned: number;
  guildsJoined: number;
  activeSessions: number;
  bannedReason: string | null;
  isInstanceOwner: boolean;
  createdAt: string;
}

export interface InstanceBanDto extends UserPublicDto {
  reason: string | null;
  bannedByUsername: string | null;
  createdAt: string;
}

/** Сервер глазами владельца инстанса */
export interface InstanceGuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerUsername: string | null;
  members: number;
  channels: number;
  createdAt: string;
}

export interface InstanceOverviewDto {
  usersTotal: number;
  onlineNow: number;
  guildsTotal: number;
  messagesTotal: number;
  dmMessagesTotal: number;
  activeSessions: number;
  bannedTotal: number;
  storageMb: number;
  serverVersion: string;
  uptimeSeconds: number;
}

/** Настройки инстанса (лимиты и доступ) */
export interface InstanceSettingsDto {
  registrationOpen: boolean;
  maxGuildsPerUser: number;
}

export interface StorageStatsDto {
  totalMb: number;
  filesTotal: number;
  /** Вложения без сообщения (загрузили и не отправили) */
  orphanFiles: number;
  orphanMb: number;
  top: { username: string; mb: number; files: number }[];
}

/** Код регистрации в приложении (панель владельца приложения) */
export interface RegistrationInviteDto {
  id: string;
  code: string;
  url: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface RegistrationInviteCheckDto {
  valid: boolean;
}

/** О чём обращение: не работает, нашёл ошибку, есть пожелание */
export type SupportKind = 'PROBLEM' | 'BUG' | 'IDEA';

/** Разбор обращения владельцем */
export type SupportStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';

export interface SupportTicketDto {
  id: string;
  kind: SupportKind;
  status: SupportStatus;
  message: string;
  /** Версия и платформа приходят сами: без них половина сообщений неразбираема */
  appVersion: string | null;
  platform: string | null;
  author: UserPublicDto | null;
  createdAt: string;
}
