import { z } from 'zod';

/** Имя пользователя: 3–24 символа, буквы/цифры/_ . - (раздел 5.1 PRD) */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Имя должно быть не короче 3 символов')
  .max(24, 'Имя должно быть не длиннее 24 символов')
  .regex(/^[\p{L}\p{N}_.-]+$/u, 'Допустимы только буквы, цифры и символы _ . -');

/** Пароль: минимум 10 символов (раздел 5.1 PRD) */
export const passwordSchema = z
  .string()
  .min(10, 'Пароль должен быть не короче 10 символов')
  .max(128, 'Пароль должен быть не длиннее 128 символов');

export const registerSchema = z.object({
  inviteCode: z.string().trim().min(4).max(64),
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(24),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createInviteSchema = z.object({
  /** null/не задано — без лимита использований */
  maxUses: z.number().int().min(1).max(1000).nullish(),
  /** null/не задано — бессрочный */
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .nullish(),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(32),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const channelTypeSchema = z.enum(['TEXT', 'VOICE']);

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(32),
  type: channelTypeSchema,
  topic: z.string().trim().max(1024).optional(),
  categoryId: z.string().uuid().nullish(),
  isPrivate: z.boolean().optional(),
  /** Роли, которым виден приватный канал */
  allowedRoleIds: z.array(z.string().uuid()).max(50).optional(),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  topic: z.string().trim().max(1024).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
  isPrivate: z.boolean().optional(),
  allowedRoleIds: z.array(z.string().uuid()).max(50).optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const sendMessageSchema = z
  .object({
    content: z.string().max(4000, 'Сообщение слишком длинное (максимум 4000 символов)').default(''),
    replyToId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachmentIds?.length ?? 0) > 0,
    'Сообщение не может быть пустым',
  );
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messagesQuerySchema = z.object({
  /** id сообщения, ДО которого грузить историю (курсор) */
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessagesQueryInput = z.infer<typeof messagesQuerySchema>;

export const editMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Сообщение не может быть пустым')
    .max(4000, 'Сообщение слишком длинное (максимум 4000 символов)')
    .refine((s) => s.trim().length > 0, 'Сообщение не может быть пустым'),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

/** Эмодзи реакции: непустая строка без пробелов (может быть несколько кодпоинтов) */
export const reactionEmojiSchema = z.string().min(1).max(32).regex(/^\S+$/u, 'Недопустимый эмодзи');

/** Полезная нагрузка клиентского события typing */
export const typingSchema = z.object({
  channelId: z.string().uuid(),
});
export type TypingInput = z.infer<typeof typingSchema>;

/** Отметка «прочитано до этого сообщения включительно» */
export const ackSchema = z.object({
  messageId: z.string().uuid(),
});
export type AckInput = z.infer<typeof ackSchema>;

/** Регулярка упоминаний: @имя (как в usernameSchema) или @everyone */
export const MENTION_PATTERN = /@([\p{L}\p{N}_.-]{2,24})/gu;
export const EVERYONE_MENTION = '@everyone';

/** Состояние голоса клиента: null — вышел из голосового канала */
export const voiceStateSchema = z.object({
  channelId: z.string().uuid().nullable(),
  muted: z.boolean(),
  deafened: z.boolean(),
});
export type VoiceStateInput = z.infer<typeof voiceStateSchema>;

/** Изменение профиля (пока только имя) */
/** Отображаемое имя: 2–32 символа, без ограничений юзернейма */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Минимум 2 символа')
  .max(32, 'Максимум 32 символа');

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});

/** Ник на сервере: пусто (null) — вернуть displayName */
export const updateNicknameSchema = z.object({
  nickname: z.string().trim().max(32, 'Максимум 32 символа').or(z.literal('')),
});
export type UpdateNicknameInput = z.infer<typeof updateNicknameSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Причина модерационного действия (кик/бан) */
export const moderationReasonSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;

/** Таймаут: от минуты до 28 дней */
export const timeoutSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 28),
  reason: z.string().trim().max(500).optional(),
});
export type TimeoutInput = z.infer<typeof timeoutSchema>;

export const auditQuerySchema = z.object({
  /** id записи, ДО которой грузить (курсор) */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

// Личные сообщения (раздел 5.6 PRD)
export const openDmSchema = z.object({
  userId: z.string().uuid(),
});
export type OpenDmInput = z.infer<typeof openDmSchema>;

export const sendDmSchema = z
  .object({
    content: z.string().max(4000, 'Сообщение слишком длинное (максимум 4000 символов)').default(''),
    replyToId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachmentIds?.length ?? 0) > 0,
    'Сообщение не может быть пустым',
  );
export type SendDmInput = z.infer<typeof sendDmSchema>;

export const editDmSchema = z.object({
  content: z
    .string()
    .min(1, 'Сообщение не может быть пустым')
    .max(4000, 'Сообщение слишком длинное (максимум 4000 символов)')
    .refine((s) => s.trim().length > 0, 'Сообщение не может быть пустым'),
});
export type EditDmInput = z.infer<typeof editDmSchema>;

/** Заявка в друзья по имени пользователя */
export const sendFriendRequestSchema = z.object({ username: usernameSchema });
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;

/** Название сервера: 2–48 символов */
export const createGuildSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(48, 'Максимум 48 символов'),
});
export type CreateGuildInput = z.infer<typeof createGuildSchema>;

/** Обновление сервера: имя и/или иконка (data-URL/URL) */
export const updateGuildSchema = z.object({
  name: z.string().trim().min(2).max(48).optional(),
  iconUrl: z.string().trim().max(500_000).nullish(),
});
export type UpdateGuildInput = z.infer<typeof updateGuildSchema>;

const roleColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB')
  .nullish();

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(32),
  color: roleColor,
  permissions: z.number().int().min(0),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  color: roleColor,
  permissions: z.number().int().min(0).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** Поиск по переписке в личке */
export const dmSearchSchema = z.object({
  q: z.string().trim().min(1, 'Введите запрос').max(100),
});
export type DmSearchInput = z.infer<typeof dmSearchSchema>;

/** Старт звонка в личке: с камерой или только голос */
export const startDmCallSchema = z.object({ video: z.boolean().default(false) });
export type StartDmCallInput = z.infer<typeof startDmCallSchema>;

/** Передача владения сервером другому участнику */
export const transferGuildSchema = z.object({ userId: z.string().uuid() });
export type TransferGuildInput = z.infer<typeof transferGuildSchema>;

/** Создание кода регистрации в приложении (владелец приложения) */
export const createRegistrationInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(10000).nullish(),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .nullish(),
});
export type CreateRegistrationInviteInput = z.infer<typeof createRegistrationInviteSchema>;

/** Глобальный бан аккаунта владельцем приложения */
export const instanceBanSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type InstanceBanInput = z.infer<typeof instanceBanSchema>;

/** Настройки инстанса */
export const instanceSettingsSchema = z.object({
  registrationOpen: z.boolean().optional(),
  maxGuildsPerUser: z.number().int().min(1).max(500).optional(),
});
export type InstanceSettingsInput = z.infer<typeof instanceSettingsSchema>;
