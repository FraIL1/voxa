import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { RequestUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Доступ только владельцу всего приложения (флаг isInstanceOwner) */
@Injectable()
export class InstanceOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user) return false;

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { isInstanceOwner: true },
    });
    if (!user?.isInstanceOwner) {
      throw new ForbiddenException('Раздел доступен только владельцу приложения');
    }
    return true;
  }
}
