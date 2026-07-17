import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { combineMasks, hasPermission, Permissions } from '@voxa/shared';
import type { MeDto, MemberDto, RoleDto } from '@voxa/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Итоговая маска прав пользователя (OR всех его ролей) */
  async permissionMaskOf(userId: string): Promise<number> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { permissions: true } } },
    });
    return combineMasks(userRoles.map((ur) => ur.role.permissions));
  }

  async roleIdsOf(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return userRoles.map((ur) => ur.roleId);
  }

  /**
   * id каналов, видимых пользователю: все публичные + приватные,
   * доступные его ролям (ADMINISTRATOR видит всё).
   */
  async visibleChannelIdsOf(userId: string): Promise<string[]> {
    const mask = await this.permissionMaskOf(userId);
    if (hasPermission(mask, Permissions.ADMINISTRATOR)) {
      const all = await this.prisma.channel.findMany({ select: { id: true } });
      return all.map((c) => c.id);
    }
    const roleIds = await this.roleIdsOf(userId);
    const channels = await this.prisma.channel.findMany({
      where: {
        OR: [{ isPrivate: false }, { allowedRoles: { some: { roleId: { in: roleIds } } } }],
      },
      select: { id: true },
    });
    return channels.map((c) => c.id);
  }

  /** Видим ли канал пользователю */
  async canSeeChannel(userId: string, channelId: string): Promise<boolean> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { allowedRoles: { select: { roleId: true } } },
    });
    if (!channel) return false;
    if (!channel.isPrivate) return true;

    const mask = await this.permissionMaskOf(userId);
    if (hasPermission(mask, Permissions.ADMINISTRATOR)) return true;

    const roleIds = await this.roleIdsOf(userId);
    const allowed = new Set(channel.allowedRoles.map((ar) => ar.roleId));
    return roleIds.some((id) => allowed.has(id));
  }

  /** Все участники сообщества со статусом присутствия и ролями (по старшинству) */
  async listMembers(onlineUserIds: ReadonlySet<string>): Promise<MemberDto[]> {
    const users = await this.prisma.user.findMany({
      include: {
        roles: {
          include: { role: { select: { id: true, name: true, color: true, position: true } } },
        },
        ban: { select: { userId: true } },
      },
      orderBy: { usernameLower: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      status: onlineUserIds.has(user.id) ? ('online' as const) : ('offline' as const),
      roles: user.roles
        .map((ur) => ur.role)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position })),
      timedOutUntil: user.timedOutUntil?.toISOString() ?? null,
      banned: user.ban !== null,
    }));
  }

  /** Кому виден канал (для адресатов упоминаний): все или роли приватного канала + админы */
  async visibleUserIdsOfChannel(channelId: string): Promise<string[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { allowedRoles: { select: { roleId: true } } },
    });
    if (!channel) return [];

    if (!channel.isPrivate) {
      const all = await this.prisma.user.findMany({ select: { id: true } });
      return all.map((u) => u.id);
    }

    const roles = await this.prisma.role.findMany({ select: { id: true, permissions: true } });
    const adminRoleIds = roles
      .filter((r) => hasPermission(r.permissions, Permissions.ADMINISTRATOR))
      .map((r) => r.id);
    const allowedRoleIds = [...channel.allowedRoles.map((ar) => ar.roleId), ...adminRoleIds];

    const memberships = await this.prisma.userRole.findMany({
      where: { roleId: { in: allowedRoleIds } },
      select: { userId: true },
    });
    return [...new Set(memberships.map((m) => m.userId))];
  }

  /** Смена имени. Старые access-токены несут прежнее имя до refresh — это ок */
  async updateProfile(userId: string, username: string): Promise<MeDto> {
    const usernameLower = username.toLowerCase();
    const clash = await this.prisma.user.findFirst({
      where: { usernameLower, NOT: { id: userId } },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Это имя уже занято');

    await this.prisma.user.update({
      where: { id: userId },
      data: { username, usernameLower },
    });
    return this.getMe(userId);
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const roles: RoleDto[] = user.roles
      .map((ur) => ur.role)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        permissions: r.permissions,
        position: r.position,
        isDefault: r.isDefault,
        isOwnerRole: r.isOwnerRole,
      }));

    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      permissions: combineMasks(roles.map((r) => r.permissions)),
      roles,
      timedOutUntil: user.timedOutUntil?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
