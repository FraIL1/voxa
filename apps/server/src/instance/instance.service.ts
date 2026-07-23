import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { WsEvents } from '@voxa/shared';
import type {
  InstanceBanDto,
  InstanceGuildDto,
  InstanceOverviewDto,
  InstanceSettingsDto,
  InstanceSettingsInput,
  InstanceUserDto,
  StorageStatsDto,
} from '@voxa/shared';
import { createRequire } from 'node:module';

import { FilesService } from '../files/files.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

const pkg = createRequire(__filename)('../../package.json') as { version: string };

const REGISTRATION_KEY = 'instance:registrationOpen';
const MAX_GUILDS_KEY = 'instance:maxGuildsPerUser';
const DEFAULT_MAX_GUILDS = 20;
const SEARCH_LIMIT = 50;
const TOP_STORAGE = 10;

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

/** Панель владельца приложения: глобальные баны, серверы, лимиты, хранилище */
@Injectable()
export class InstanceService {
  private readonly logger = new Logger(InstanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly files: FilesService,
    private readonly ws: WsGateway,
  ) {}

  // ---------- Настройки ----------

  async settings(): Promise<InstanceSettingsDto> {
    const rows = await this.prisma.appMeta.findMany({
      where: { key: { in: [REGISTRATION_KEY, MAX_GUILDS_KEY] } },
    });
    const value = (key: string): string | undefined => rows.find((r) => r.key === key)?.value;
    return {
      registrationOpen: value(REGISTRATION_KEY) !== 'false',
      maxGuildsPerUser: Number(value(MAX_GUILDS_KEY) ?? DEFAULT_MAX_GUILDS),
    };
  }

  async updateSettings(input: InstanceSettingsInput): Promise<InstanceSettingsDto> {
    const put = async (key: string, value: string): Promise<void> => {
      await this.prisma.appMeta.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    };
    if (input.registrationOpen !== undefined) {
      await put(REGISTRATION_KEY, String(input.registrationOpen));
    }
    if (input.maxGuildsPerUser !== undefined) {
      await put(MAX_GUILDS_KEY, String(input.maxGuildsPerUser));
    }
    return this.settings();
  }

  /** Открыта ли регистрация (проверяется при создании аккаунта) */
  async registrationOpen(): Promise<boolean> {
    return (await this.settings()).registrationOpen;
  }

  async maxGuildsPerUser(): Promise<number> {
    return (await this.settings()).maxGuildsPerUser;
  }

  // ---------- Обзор ----------

  async overview(): Promise<InstanceOverviewDto> {
    const [
      usersTotal,
      guildsTotal,
      messagesTotal,
      dmMessagesTotal,
      activeSessions,
      bannedTotal,
      files,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.guild.count(),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.dmMessage.count({ where: { deletedAt: null } }),
      this.prisma.refreshSession.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.instanceBan.count(),
      this.prisma.attachment.aggregate({ _sum: { size: true } }),
    ]);

    return {
      usersTotal,
      onlineNow: this.presence.onlineUserIds().size,
      guildsTotal,
      messagesTotal,
      dmMessagesTotal,
      activeSessions,
      bannedTotal,
      storageMb: Math.round((files._sum.size ?? 0) / (1024 * 1024)),
      serverVersion: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  // ---------- Пользователи ----------

  async listUsers(query?: string): Promise<InstanceUserDto[]> {
    const search = query?.trim().replace(/^@/, '');
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { usernameLower: { contains: search.toLowerCase() } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'asc' },
      take: SEARCH_LIMIT,
      include: {
        instanceBan: { select: { reason: true } },
        _count: { select: { guildsOwned: true, guildMemberships: true } },
      },
    });

    const online = this.presence.onlineUserIds();
    const sessions = await this.prisma.refreshSession.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((u) => u.id) },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      _count: { _all: true },
    });
    const sessionsOf = new Map(sessions.map((s) => [s.userId, s._count._all]));

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: online.has(user.id) ? ('online' as const) : ('offline' as const),
      guildsOwned: user._count.guildsOwned,
      guildsJoined: user._count.guildMemberships,
      activeSessions: sessionsOf.get(user.id) ?? 0,
      bannedReason: user.instanceBan ? (user.instanceBan.reason ?? '') : null,
      isInstanceOwner: user.isInstanceOwner,
      createdAt: user.createdAt.toISOString(),
    }));
  }

  /** Глобальный бан: вход запрещён, сессии убиты, отовсюду выгнан */
  async banUser(actorId: string, userId: string, reason?: string): Promise<void> {
    if (actorId === userId) throw new BadRequestException('Нельзя забанить самого себя');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isInstanceOwner: true },
    });
    if (!target) throw new BadRequestException('Пользователь не найден');
    if (target.isInstanceOwner) {
      throw new ForbiddenException('Владельца приложения забанить нельзя');
    }

    await this.prisma.instanceBan.upsert({
      where: { userId },
      create: { userId, reason: reason ?? null, bannedById: actorId },
      update: { reason: reason ?? null, bannedById: actorId },
    });

    // Выкидываем со всех серверов и из всех сессий
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      select: { guildId: true },
    });
    await this.prisma.guildMember.deleteMany({ where: { userId } });
    await this.prisma.userRole.deleteMany({ where: { userId } });
    for (const { guildId } of memberships) {
      await this.ws.removeUserFromGuild(userId, guildId);
      this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    }

    await this.revokeSessions(userId, reason ? `Доступ закрыт: ${reason}` : 'Доступ закрыт');
    this.logger.warn(`Глобальный бан пользователя ${userId} (выдал ${actorId})`);
  }

  async unbanUser(userId: string): Promise<void> {
    const { count } = await this.prisma.instanceBan.deleteMany({ where: { userId } });
    if (count === 0) throw new BadRequestException('Пользователь не забанен глобально');
  }

  async listBans(): Promise<InstanceBanDto[]> {
    const bans = await this.prisma.instanceBan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT }, bannedBy: { select: { username: true } } },
    });
    return bans.map((ban) => ({
      id: ban.user.id,
      username: ban.user.username,
      displayName: ban.user.displayName,
      avatarUrl: ban.user.avatarUrl,
      reason: ban.reason,
      bannedByUsername: ban.bannedBy?.username ?? null,
      createdAt: ban.createdAt.toISOString(),
    }));
  }

  /** Принудительный выход со всех устройств */
  async revokeSessions(
    userId: string,
    reason = 'Сессии завершены владельцем приложения',
  ): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.ws.forceLogout(userId, reason);
  }

  /** Забанен ли аккаунт глобально (проверка при входе и в сокетах) */
  async banOf(userId: string): Promise<{ reason: string | null } | null> {
    return this.prisma.instanceBan.findUnique({
      where: { userId },
      select: { reason: true },
    });
  }

  // ---------- Серверы ----------

  async listGuilds(): Promise<InstanceGuildDto[]> {
    const guilds = await this.prisma.guild.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        owner: { select: { username: true } },
        _count: { select: { members: true, channels: true } },
      },
    });
    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      ownerUsername: guild.owner?.username ?? null,
      members: guild._count.members,
      channels: guild._count.channels,
      createdAt: guild.createdAt.toISOString(),
    }));
  }

  /** Удаление любого сервера владельцем приложения */
  async deleteGuild(guildId: string): Promise<void> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    await this.prisma.guild.delete({ where: { id: guildId } });
    for (const { userId } of members) {
      await this.ws.removeUserFromGuild(userId, guildId);
    }
    this.ws.emitToUsers(
      members.map((m) => m.userId),
      WsEvents.MeGuildsChanged,
      {},
    );
  }

  // ---------- Хранилище ----------

  async storage(): Promise<StorageStatsDto> {
    const [total, orphans, byUser] = await Promise.all([
      this.prisma.attachment.aggregate({ _sum: { size: true }, _count: { _all: true } }),
      this.prisma.attachment.aggregate({
        where: { messageId: null, dmMessageId: null },
        _sum: { size: true },
        _count: { _all: true },
      }),
      this.prisma.attachment.groupBy({
        by: ['uploaderId'],
        _sum: { size: true },
        _count: { _all: true },
        orderBy: { _sum: { size: 'desc' } },
        take: TOP_STORAGE,
      }),
    ]);

    const uploaderIds = byUser.flatMap((r) => (r.uploaderId ? [r.uploaderId] : []));
    const uploaders = await this.prisma.user.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, username: true },
    });
    const nameOf = new Map(uploaders.map((u) => [u.id, u.username]));

    const mb = (bytes: number | null): number =>
      Math.round(((bytes ?? 0) / (1024 * 1024)) * 10) / 10;

    return {
      totalMb: mb(total._sum.size),
      filesTotal: total._count._all,
      orphanFiles: orphans._count._all,
      orphanMb: mb(orphans._sum.size),
      top: byUser.map((row) => ({
        username: (row.uploaderId && nameOf.get(row.uploaderId)) || '—',
        mb: mb(row._sum.size),
        files: row._count._all,
      })),
    };
  }

  /** Удаление вложений, которые загрузили, но так и не отправили */
  async cleanupOrphans(): Promise<{ removed: number }> {
    const before = await this.prisma.attachment.count({
      where: { messageId: null, dmMessageId: null },
    });
    await this.files.removeOrphans();
    return { removed: before };
  }
}
