import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@voxa/shared';

import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<number>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user) return false; // public-роут с @RequirePermissions — ошибка конфигурации

    const mask = await this.usersService.permissionMaskOf(request.user.id);
    if (!hasPermission(mask, required)) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }
}
