import { Controller, Get, Query } from '@nestjs/common';
import {
  auditQuerySchema,
  Permissions,
  type AdminOverviewDto,
  type AuditPageDto,
  type AuditQueryInput,
} from '@voxa/shared';
import { createRequire } from 'node:module';

import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

const pkg = createRequire(__filename)('../../package.json') as { version: string };

/** Панель владельца (раздел 5.10 PRD) — только ADMINISTRATOR */
@Controller('admin')
@RequirePermissions(Permissions.ADMINISTRATOR)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  async overview(): Promise<AdminOverviewDto> {
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

  @Get('audit')
  async auditLog(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<AuditPageDto> {
    return this.audit.list(query);
  }
}
