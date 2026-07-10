import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Требуемые биты прав (проверяются PermissionsGuard после аутентификации) */
export const RequirePermissions = (...permissions: number[]) =>
  SetMetadata(
    PERMISSIONS_KEY,
    permissions.reduce((acc, p) => acc | p, 0),
  );
