import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditPageDto, AuditQueryInput } from '@voxa/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Запись в журнал сервера; сбой аудита не должен ронять само действие */
  log(
    guildId: string | null,
    actorId: string | null,
    action: string,
    target?: { type: string; id: string },
    meta?: Record<string, unknown>,
  ): void {
    void this.prisma.auditLog
      .create({
        data: {
          guildId,
          actorId,
          action,
          targetType: target?.type ?? null,
          targetId: target?.id ?? null,
          meta: meta as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((error: Error) => this.logger.error(`Не удалось записать аудит: ${error.message}`));
  }

  async list(guildId: string, query: AuditQueryInput): Promise<AuditPageDto> {
    const rows = await this.prisma.auditLog.findMany({
      where: { guildId },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...(query.before ? { cursor: { id: BigInt(query.before) }, skip: 1 } : {}),
      include: { actor: { select: { username: true } } },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => ({
        id: row.id.toString(),
        actorUsername: row.actor?.username ?? null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        meta: (row.meta as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore,
    };
  }
}
