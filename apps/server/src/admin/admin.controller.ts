import { Controller, ForbiddenException, Get } from '@nestjs/common';
import type { AdminOverviewDto } from '@voxa/shared';
import { createRequire } from 'node:module';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

const pkg = createRequire(__filename)('../../package.json') as { version: string };

/** Обзор инстанса — доступен владельцам серверов */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: RequestUser): Promise<AdminOverviewDto> {
    const ownsGuild = await this.prisma.guild.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    });
    if (!ownsGuild) {
      throw new ForbiddenException('Обзор доступен владельцам серверов');
    }

    const [usersTotal, activeSessions, files] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.refreshSession.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.attachment.aggregate({ _sum: { size: true } }),
    ]);

    return {
      usersTotal,
      onlineNow: this.presence.onlineUserIds().size,
      activeSessions,
      filesTotalMb: Math.round((files._sum.size ?? 0) / (1024 * 1024)),
      serverVersion: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
