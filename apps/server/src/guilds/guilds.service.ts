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
  type GuildDto,
  type JoinGuildResultDto,
} from '@voxa/shared';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

export const OWNER_ROLE_NAME = 'Владелец';
export const MEMBER_ROLE_NAME = 'Участник';
export const MEMBER_MASK = Permissions.SEND_MESSAGES | Permissions.UPLOAD_FILES;

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  private async toDto(guild: Guild, userId: string): Promise<GuildDto> {
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      ownerId: guild.ownerId,
      myPermissions: await this.users.permissionMaskOf(userId, guild.id),
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

  /** Создание сервера: роли Владелец/Участник + стартовые каналы */
  async create(userId: string, input: CreateGuildInput): Promise<GuildDto> {
    const guild = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guild.create({ data: { name: input.name, ownerId: userId } });
      const ownerRole = await tx.role.create({
        data: {
          guildId: created.id,
          name: OWNER_ROLE_NAME,
          color: '#FF7A45',
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

    const ban = await this.prisma.ban.findUnique({
      where: { guildId_userId: { guildId: invite.guildId, userId } },
    });
    if (ban) {
      throw new ForbiddenException(
        ban.reason
          ? `Вы заблокированы на этом сервере: ${ban.reason}`
          : 'Вы заблокированы на этом сервере',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      await tx.guildMember.create({ data: { guildId: invite.guildId, userId } });

      const roleIds = new Set<string>();
      const defaultRole = await tx.role.findFirst({
        where: { guildId: invite.guildId, isDefault: true },
      });
      if (defaultRole) roleIds.add(defaultRole.id);
      if (invite.grantsRoleId) roleIds.add(invite.grantsRoleId);
      if (roleIds.size > 0) {
        await tx.userRole.createMany({
          data: [...roleIds].map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
    });

    await this.ws.joinUserToGuild(userId, invite.guildId);
    this.ws.emitToGuild(invite.guildId, WsEvents.GuildMembersChanged, {
      guildId: invite.guildId,
    });
    this.ws.emitToUsers([userId], WsEvents.MeGuildsChanged, {});
    return { guildId: invite.guildId };
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
