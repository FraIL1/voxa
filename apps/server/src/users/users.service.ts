import { Injectable, NotFoundException } from '@nestjs/common';
import { combineMasks, hasPermission, Permissions } from '@voxa/shared';
import type { MeDto, RoleDto } from '@voxa/shared';

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
      createdAt: user.createdAt.toISOString(),
    };
  }
}
