import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Guild } from '@prisma/client';
import {
  Permissions,
  WsEvents,
  type CreateGuildInput,
  type DiscoverGuildDto,
  type GuildDto,
  type GuildJoinRequestDto,
  type JoinAttemptResultDto,
  type NotifyMode,
  type JoinGuildResultDto,
  type UpdateGuildInput,
} from '@voxa/shared';

import { InstanceService } from '../instance/instance.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

export const OWNER_ROLE_NAME = 'Владелец';
export const MEMBER_ROLE_NAME = 'Участник';
/** Сколько серверов показываем в витрине */
const DISCOVER_LIMIT = 50;

export const MEMBER_MASK = Permissions.SEND_MESSAGES | Permissions.UPLOAD_FILES;

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly instance: InstanceService,
    private readonly ws: WsGateway,
  ) {}

  private async toDto(guild: Guild, userId: string): Promise<GuildDto> {
    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId } },
      select: { notifyMode: true },
    });
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      description: guild.description,
      joinMode: guild.joinMode,
      ownerId: guild.ownerId,
      myPermissions: await this.users.permissionMaskOf(userId, guild.id),
      myNotifyMode: membership?.notifyMode ?? 'ALL',
      createdAt: guild.createdAt.toISOString(),
    };
  }

  /** Серверы пользователя (в порядке вступления) */
  async myGuilds(userId: string): Promise<GuildDto[]> {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      include: { guild: true },
      orderBy: { joinedAt: 'asc' },
    });
    return Promise.all(memberships.map((m) => this.toDto(m.guild, userId)));
  }

  async guildDto(userId: string, guildId: string): Promise<GuildDto> {
    await this.users.assertMember(guildId, userId);
    const guild = await this.prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
    return this.toDto(guild, userId);
  }

  /** Профиль сервера: имя и/или иконка (право MANAGE_CHANNELS проверяет guard) */
  async update(userId: string, guildId: string, input: UpdateGuildInput): Promise<GuildDto> {
    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        name: input.name,
        iconUrl: input.iconUrl === undefined ? undefined : input.iconUrl,
        description: input.description === undefined ? undefined : input.description,
        joinMode: input.joinMode,
      },
    });
    this.ws.emitToGuild(guildId, WsEvents.GuildUpdated, { guildId });
    return this.toDto(guild, userId);
  }

  /** Создание сервера: роли Владелец/Участник + стартовые каналы */
  async create(userId: string, input: CreateGuildInput): Promise<GuildDto> {
    const limit = await this.instance.maxGuildsPerUser();
    const owned = await this.prisma.guild.count({ where: { ownerId: userId } });
    if (owned >= limit) {
      throw new BadRequestException(`Нельзя создать больше ${limit} серверов на один аккаунт`);
    }

    const guild = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guild.create({ data: { name: input.name, ownerId: userId } });
      const ownerRole = await tx.role.create({
        data: {
          guildId: created.id,
          name: OWNER_ROLE_NAME,
          color: '#FBBF24',
          permissions: Permissions.ADMINISTRATOR,
          position: 100,
          isOwnerRole: true,
        },
      });
      await tx.role.create({
        data: {
          guildId: created.id,
          name: MEMBER_ROLE_NAME,
          permissions: MEMBER_MASK,
          position: 0,
          isDefault: true,
        },
      });
      await tx.guildMember.create({ data: { guildId: created.id, userId } });
      await tx.userRole.create({ data: { userId, roleId: ownerRole.id } });

      const text = await tx.category.create({
        data: { guildId: created.id, name: 'Текст', position: 0 },
      });
      const voice = await tx.category.create({
        data: { guildId: created.id, name: 'Голос', position: 1 },
      });
      await tx.channel.createMany({
        data: [
          { guildId: created.id, name: 'общий', type: 'TEXT', categoryId: text.id, position: 0 },
          { guildId: created.id, name: 'Общий', type: 'VOICE', categoryId: voice.id, position: 0 },
        ],
      });
      return created;
    });

    await this.ws.joinUserToGuild(userId, guild.id);
    this.ws.emitToUsers([userId], WsEvents.MeGuildsChanged, {});
    return this.toDto(guild, userId);
  }

  /** Вход по инвайту для уже зарегистрированного пользователя */
  async joinByInvite(userId: string, code: string): Promise<JoinGuildResultDto> {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    const now = new Date();
    const valid =
      invite !== null &&
      invite.revokedAt === null &&
      (invite.expiresAt === null || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.uses < invite.maxUses);
    if (!invite || !valid) {
      throw new BadRequestException('Инвайт недействителен, истёк или отозван');
    }

    if (await this.users.isMember(invite.guildId, userId)) {
      return { guildId: invite.guildId }; // уже участник — просто переходим
    }

    await this.assertNotBanned(userId, invite.guildId);

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { uses: { increment: 1 } },
    });
    await this.addMember(userId, invite.guildId, invite.grantsRoleId ?? undefined);
    return { guildId: invite.guildId };
  }

  /** Мои уведомления с этого сервера */
  async setNotifyMode(userId: string, guildId: string, mode: NotifyMode): Promise<GuildDto> {
    await this.users.assertMember(guildId, userId);
    await this.prisma.guildMember.update({
      where: { guildId_userId: { guildId, userId } },
      data: { notifyMode: mode },
    });
    const guild = await this.prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
    return this.toDto(guild, userId);
  }

  /** Общий приём в участники: членство + роль по умолчанию + оповещения */
  private async addMember(userId: string, guildId: string, grantsRoleId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.guildMember.create({ data: { guildId, userId } });

      const roleIds = new Set<string>();
      const defaultRole = await tx.role.findFirst({ where: { guildId, isDefault: true } });
      if (defaultRole) roleIds.add(defaultRole.id);
      if (grantsRoleId) roleIds.add(grantsRoleId);
      if (roleIds.size > 0) {
        await tx.userRole.createMany({
          data: [...roleIds].map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
      // Заявка (если была) больше не нужна
      await tx.guildJoinRequest.deleteMany({ where: { guildId, userId } });
    });

    await this.ws.joinUserToGuild(userId, guildId);
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.ws.emitToUsers([userId], WsEvents.MeGuildsChanged, {});
  }

  /** 403, если пользователь забанен на сервере */
  private async assertNotBanned(userId: string, guildId: string): Promise<void> {
    const ban = await this.prisma.ban.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (ban) {
      throw new ForbiddenException(
        ban.reason
          ? `Вы заблокированы на этом сервере: ${ban.reason}`
          : 'Вы заблокированы на этом сервере',
      );
    }
  }

  /** Витрина: публичные серверы и серверы по заявке, где я ещё не состою */
  async discover(userId: string, query?: string): Promise<DiscoverGuildDto[]> {
    const search = query?.trim();
    const guilds = await this.prisma.guild.findMany({
      where: {
        joinMode: { in: ['PUBLIC', 'REQUEST'] },
        members: { none: { userId } },
        bans: { none: { userId } },
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: DISCOVER_LIMIT,
      include: {
        _count: { select: { members: true } },
        joinRequests: { where: { userId }, select: { userId: true } },
      },
    });

    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      description: guild.description,
      joinMode: guild.joinMode,
      members: guild._count.members,
      requested: guild.joinRequests.length > 0,
    }));
  }

  /**
   * Попытка вступить из витрины: публичный сервер принимает сразу,
   * сервер по заявке — создаёт заявку, закрытый — отказ.
   */
  async attemptJoin(
    userId: string,
    guildId: string,
    message?: string,
  ): Promise<JoinAttemptResultDto> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true, joinMode: true },
    });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (await this.users.isMember(guildId, userId)) return { status: 'joined', guildId };
    await this.assertNotBanned(userId, guildId);

    if (guild.joinMode === 'INVITE_ONLY') {
      throw new ForbiddenException('На этот сервер можно попасть только по приглашению');
    }

    if (guild.joinMode === 'PUBLIC') {
      await this.addMember(userId, guildId);
      return { status: 'joined', guildId };
    }

    // REQUEST: заявка ждёт решения модератора
    await this.prisma.guildJoinRequest.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, message: message?.trim() || null },
      update: { message: message?.trim() || null },
    });
    this.ws.emitToGuild(guildId, WsEvents.GuildJoinRequestsChanged, { guildId });
    return { status: 'requested', guildId };
  }

  /** Отозвать свою заявку */
  async cancelJoinRequest(userId: string, guildId: string): Promise<void> {
    await this.prisma.guildJoinRequest.deleteMany({ where: { guildId, userId } });
    this.ws.emitToGuild(guildId, WsEvents.GuildJoinRequestsChanged, { guildId });
  }

  /** Заявки на вступление (право KICK_MEMBERS проверяет guard) */
  async listJoinRequests(guildId: string): Promise<GuildJoinRequestDto[]> {
    const requests = await this.prisma.guildJoinRequest.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    return requests.map((r) => ({
      user: r.user,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async approveJoinRequest(guildId: string, userId: string): Promise<void> {
    const request = await this.prisma.guildJoinRequest.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!request) throw new NotFoundException('Заявка не найдена');
    await this.assertNotBanned(userId, guildId);
    await this.addMember(userId, guildId);
    this.ws.emitToGuild(guildId, WsEvents.GuildJoinRequestsChanged, { guildId });
  }

  async rejectJoinRequest(guildId: string, userId: string): Promise<void> {
    const { count } = await this.prisma.guildJoinRequest.deleteMany({ where: { guildId, userId } });
    if (count === 0) throw new NotFoundException('Заявка не найдена');
    this.ws.emitToGuild(guildId, WsEvents.GuildJoinRequestsChanged, { guildId });
  }

  async leave(userId: string, guildId: string): Promise<void> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (guild.ownerId === userId) {
      throw new BadRequestException('Владелец не может покинуть свой сервер');
    }
    await this.removeMember(guildId, userId);
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.ws.emitToUsers([userId], WsEvents.MeGuildsChanged, {});
  }

  /** Передача владения другому участнику: владелец становится обычным */
  async transferOwnership(ownerId: string, guildId: string, newOwnerId: string): Promise<GuildDto> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (guild.ownerId !== ownerId) {
      throw new ForbiddenException('Передать сервер может только его владелец');
    }
    if (newOwnerId === ownerId) {
      throw new BadRequestException('Вы уже владелец этого сервера');
    }
    if (!(await this.users.isMember(guildId, newOwnerId))) {
      throw new BadRequestException('Новый владелец должен быть участником сервера');
    }

    const ownerRole = await this.prisma.role.findFirst({ where: { guildId, isOwnerRole: true } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.guild.update({
        where: { id: guildId },
        data: { ownerId: newOwnerId },
      });
      // Роль «Владелец» переезжает вместе с владением
      if (ownerRole) {
        await tx.userRole.deleteMany({ where: { roleId: ownerRole.id } });
        await tx.userRole.create({ data: { userId: newOwnerId, roleId: ownerRole.id } });
      }
      return next;
    });

    this.ws.emitToGuild(guildId, WsEvents.GuildUpdated, { guildId });
    this.ws.emitToGuild(guildId, WsEvents.GuildRolesChanged, { guildId });
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.ws.emitToUsers([ownerId, newOwnerId], WsEvents.MeGuildsChanged, {});
    return this.toDto(updated, ownerId);
  }

  /** Удаление сервера владельцем: каналы, роли и сообщения уходят каскадом */
  async remove(ownerId: string, guildId: string): Promise<void> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (guild.ownerId !== ownerId) {
      throw new ForbiddenException('Удалить сервер может только его владелец');
    }

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

  /** Снятие членства и ролей сервера (выход/кик/бан) */
  async removeMember(guildId: string, userId: string): Promise<void> {
    const deleted = await this.prisma.guildMember.deleteMany({ where: { guildId, userId } });
    if (deleted.count === 0) {
      throw new NotFoundException('Пользователь не участник этого сервера');
    }
    await this.prisma.userRole.deleteMany({ where: { userId, role: { guildId } } });
    await this.ws.removeUserFromGuild(userId, guildId);
  }
}
