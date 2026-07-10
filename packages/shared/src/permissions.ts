/**
 * Битмаска прав (раздел 5.7 PRD). У пользователя может быть несколько ролей —
 * их маски объединяются через OR. ADMINISTRATOR неявно включает все права.
 * Хранится в колонке int4, поэтому максимум 31 флаг.
 */
export const Permissions = {
  /** Все права; есть только у роли «Владелец» */
  ADMINISTRATOR: 1 << 0,
  /** Создание, изменение, удаление и перемещение каналов и категорий */
  MANAGE_CHANNELS: 1 << 1,
  /** Управление ролями */
  MANAGE_ROLES: 1 << 2,
  /** Удаление чужих сообщений */
  DELETE_MESSAGES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  BAN_MEMBERS: 1 << 5,
  /** Заглушение участников в голосовых каналах */
  MUTE_MEMBERS: 1 << 6,
  CREATE_INVITES: 1 << 7,
  MENTION_EVERYONE: 1 << 8,
  UPLOAD_FILES: 1 << 9,
  SEND_MESSAGES: 1 << 10,
} as const;

export type PermissionKey = keyof typeof Permissions;

export const ALL_PERMISSIONS: number = Object.values(Permissions).reduce(
  (acc, bit) => acc | bit,
  0,
);

/** Проверка права с учётом ADMINISTRATOR */
export function hasPermission(mask: number, permission: number): boolean {
  if ((mask & Permissions.ADMINISTRATOR) !== 0) return true;
  return (mask & permission) === permission;
}

/** Объединение масок нескольких ролей */
export function combineMasks(masks: number[]): number {
  return masks.reduce((acc, m) => acc | m, 0);
}
