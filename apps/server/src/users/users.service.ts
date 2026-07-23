import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { combineMasks, hasPermission, Permissions } from '@voxa/shared';
import type { MeDto, MemberDto } from '@voxa/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Есть ли у двоих хотя бы один общий сервер */
  async shareGuild(aId: string, bId: string): Promise<boolean> {
    const shared = await this.prisma.guildMember.findFirst({
      where: { userId: aId, guild: { members: { some: { userId: bId } } } },
      select: { guildId: true },
    });
    return shared !== null;
  }

  /** Активный таймаут участника на сервере (null — нет) */
  async timeoutOf(guildId: string, userId: string): Promise<Date | null> {
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { timedOutUntil: true },
    });
    const until = member?.timedOutUntil ?? null;
    return until && until > new Date() ? until : null;
  }

  /** 403, если участник в таймауте на этом сервере */
  async assertNotTimedOut(guildId: string, userId: string): Promise<void> {
    const until = await this.timeoutOf(guildId, userId);
    if (until) {
      throw new ForbiddenException(`Вы в таймауте до ${until.toLocaleString('ru-RU')}`);
    }
  }

  /** Участник ли пользователь сервера */
  async isMember(guildId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { userId: true },
    });
    return member !== null;
  }

  async assertMember(guildId: string, userId: string): Promise<void> {
    if (!(await this.isMember(guildId, userId))) {
      throw new ForbiddenException('Вы не участник этого сервера');
    }
  }

  /** id серверов, где пользователь состоит */
  async guildIdsOf(userId: string): Promise<string[]> {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      select: { guildId: true },
    });
    return memberships.map((m) => m.guildId);
  }

  /** Итоговая маска прав пользователя на сервере (владелец — все права) */
  async permissionMaskOf(userId: string, guildId: string): Promise<number> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (guild?.ownerId === userId) return Permissions.ADMINISTRATOR;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, role: { guildId } },
      include: { role: { select: { permissions: true } } },
    });
    return combineMasks(userRoles.map((ur) => ur.role.permissions));
  }

  async roleIdsOf(userId: string, guildId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, role: { guildId } },
      select: { roleId: true },
    });
    return userRoles.map((ur) => ur.roleId);
  }

  /**
   * id каналов сервера, видимых пользователю: публичные + приватные,
   * доступные его ролям (ADMINISTRATOR видит всё).
   */
  async visibleChannelIdsInGuild(userId: string, guildId: string): Promise<string[]> {
    const mask = await this.permissionMaskOf(userId, guildId);
    if (hasPermission(mask, Permissions.ADMINISTRATOR)) {
      const all = await this.prisma.channel.findMany({ where: { guildId }, select: { id: true } });
      return all.map((c) => c.id);
    }
    const roleIds = await this.roleIdsOf(userId, guildId);
    const channels = await this.prisma.channel.findMany({
      where: {
        guildId,
        OR: [{ isPrivate: false }, { allowedRoles: { some: { roleId: { in: roleIds } } } }],
      },
      select: { id: true },
    });
    return channels.map((c) => c.id);
  }

  /** Видимые каналы всех серверов пользователя (подписки WS) */
  async visibleChannelIdsOf(userId: string): Promise<string[]> {
    const guildIds = await this.guildIdsOf(userId);
    const perGuild = await Promise.all(
      guildIds.map((guildId) => this.visibleChannelIdsInGuild(userId, guildId)),
    );
    return perGuild.flat();
  }

  /** Видим ли канал пользователю (членство на сервере + приватность) */
  async canSeeChannel(userId: string, channelId: string): Promise<boolean> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { allowedRoles: { select: { roleId: true } } },
    });
    if (!channel) return false;
    if (!(await this.isMember(channel.guildId, userId))) return false;
    if (!channel.isPrivate) return true;

    const mask = await this.permissionMaskOf(userId, channel.guildId);
    if (hasPermission(mask, Permissions.ADMINISTRATOR)) return true;

    const roleIds = await this.roleIdsOf(userId, channel.guildId);
    const allowed = new Set(channel.allowedRoles.map((ar) => ar.roleId));
    return roleIds.some((id) => allowed.has(id));
  }

  /** Участники сервера со статусом присутствия и ролями (по старшинству) */
  async listMembers(guildId: string, onlineUserIds: ReadonlySet<string>): Promise<MemberDto[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: {
        user: {
          include: {
            roles: {
              where: { role: { guildId } },
              include: { role: { select: { id: true, name: true, color: true, position: true } } },
            },
            bansReceived: { where: { guildId }, select: { guildId: true } },
          },
        },
      },
    });

    return members
      .map((member) => ({
        id: member.user.id,
        username: member.user.username,
        displayName: member.user.displayName,
        nickname: member.nickname,
        avatarUrl: member.user.avatarUrl,
        status: onlineUserIds.has(member.user.id) ? ('online' as const) : ('offline' as const),
        roles: member.user.roles
          .map((ur) => ur.role)
          .sort((a, b) => b.position - a.position)
          .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position })),
        timedOutUntil: member.timedOutUntil?.toISOString() ?? null,
        banned: member.user.bansReceived.length > 0,
      }))
      .sort((a, b) =>
        (a.nickname ?? a.displayName).localeCompare(b.nickname ?? b.displayName, 'ru'),
      );
  }

  /** Ник на сервере: пустая строка снимает ник (возврат к displayName) */
  async setNickname(guildId: string, userId: string, nickname: string): Promise<void> {
    await this.assertMember(guildId, userId);
    await this.prisma.guildMember.update({
      where: { guildId_userId: { guildId, userId } },
      data: { nickname: nickname.trim() === '' ? null : nickname.trim() },
    });
  }

  /** Кому виден канал (адресаты упоминаний): участники сервера с доступом */
  async visibleUserIdsOfChannel(channelId: string): Promise<string[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        allowedRoles: { select: { roleId: true } },
        guild: { select: { ownerId: true } },
      },
    });
    if (!channel) return [];

    const members = await this.prisma.guildMember.findMany({
      where: { guildId: channel.guildId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (!channel.isPrivate) return memberIds;

    const roles = await this.prisma.role.findMany({
      where: { guildId: channel.guildId },
      select: { id: true, permissions: true },
    });
    const adminRoleIds = roles
      .filter((r) => hasPermission(r.permissions, Permissions.ADMINISTRATOR))
      .map((r) => r.id);
    const allowedRoleIds = [...channel.allowedRoles.map((ar) => ar.roleId), ...adminRoleIds];

    const memberships = await this.prisma.userRole.findMany({
      where: { roleId: { in: allowedRoleIds }, userId: { in: memberIds } },
      select: { userId: true },
    });
    const ids = new Set(memberships.map((m) => m.userId));
    if (channel.guild.ownerId && memberIds.includes(channel.guild.ownerId)) {
      ids.add(channel.guild.ownerId);
    }
    return [...ids];
  }

  /** Смена отображаемого имени (логин @username неизменяем) */
  async updateProfile(userId: string, displayName: string): Promise<MeDto> {
    await this.prisma.user.update({ where: { id: userId }, data: { displayName } });
    return this.getMe(userId);
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
