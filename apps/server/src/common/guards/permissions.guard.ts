import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@voxa/shared';

import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';

interface GuardRequest {
  user?: RequestUser;
  params?: Record<string, string>;
}

/**
 * Права проверяются в контексте сервера (guild): guildId берётся из
 * параметров маршрута напрямую или через принадлежность ресурса
 * (канал / категория / инвайт). Требуется членство на сервере.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<number>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.user) return false; // public-роут с @RequirePermissions — ошибка конфигурации

    const guildId = await this.resolveGuildId(request.params ?? {});
    if (!guildId) throw new NotFoundException('Ресурс не найден');

    await this.usersService.assertMember(guildId, request.user.id);
    const mask = await this.usersService.permissionMaskOf(request.user.id, guildId);
    if (!hasPermission(mask, required)) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }

  private async resolveGuildId(params: Record<string, string>): Promise<string | null> {
    if (params.guildId) return params.guildId;
    if (params.channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: params.channelId },
        select: { guildId: true },
      });
      return channel?.guildId ?? null;
    }
    if (params.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: params.categoryId },
        select: { guildId: true },
      });
      return category?.guildId ?? null;
    }
    if (params.inviteId) {
      const invite = await this.prisma.invite.findUnique({
        where: { id: params.inviteId },
        select: { guildId: true },
      });
      return invite?.guildId ?? null;
    }
    return null;
  }
}
