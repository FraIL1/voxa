import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Permissions,
  WsEvents,
  type CreateRoleInput,
  type RoleDto,
  type UpdateRoleInput,
} from '@voxa/shared';
import type { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

function toDto(role: Role): RoleDto {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    permissions: role.permissions,
    position: role.position,
    isDefault: role.isDefault,
    isOwnerRole: role.isOwnerRole,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WsGateway,
  ) {}

  async list(guildId: string): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      where: { guildId },
      orderBy: { position: 'desc' },
    });
    return roles.map(toDto);
  }

  private async assertRoleOfGuild(guildId: string, roleId: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, guildId } });
    if (!role) throw new NotFoundException('Роль не найдена');
    return role;
  }

  /** Роль ADMINISTRATOR может выдавать только владелец сервера */
  private async assertCanGrantAdmin(
    guildId: string,
    actorId: string,
    permissions: number,
  ): Promise<void> {
    if ((permissions & Permissions.ADMINISTRATOR) === 0) return;
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (guild?.ownerId !== actorId) {
      throw new ForbiddenException('Право «Администратор» может выдавать только владелец сервера');
    }
  }

  async create(guildId: string, actorId: string, input: CreateRoleInput): Promise<RoleDto> {
    await this.assertCanGrantAdmin(guildId, actorId, input.permissions);
    const clash = await this.prisma.role.findFirst({ where: { guildId, name: input.name } });
    if (clash) throw new BadRequestException('Роль с таким названием уже есть');

    // Новая роль встаёт под ролью «Владелец» (position 100)
    const max = await this.prisma.role.aggregate({
      _max: { position: true },
      where: { guildId, isOwnerRole: false },
    });
    const role = await this.prisma.role.create({
      data: {
        guildId,
        name: input.name,
        color: input.color ?? null,
        permissions: input.permissions,
        position: Math.min((max._max.position ?? 0) + 1, 99),
      },
    });
    this.emitChanged(guildId);
    return toDto(role);
  }

  async update(
    guildId: string,
    actorId: string,
    roleId: string,
    input: UpdateRoleInput,
  ): Promise<RoleDto> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    if (role.isOwnerRole) throw new ForbiddenException('Роль «Владелец» нельзя изменять');
    if (input.permissions !== undefined) {
      await this.assertCanGrantAdmin(guildId, actorId, input.permissions);
    }
    if (input.name && input.name !== role.name) {
      const clash = await this.prisma.role.findFirst({ where: { guildId, name: input.name } });
      if (clash) throw new BadRequestException('Роль с таким названием уже есть');
    }
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        color: input.color === undefined ? undefined : input.color,
        permissions: input.permissions,
      },
    });
    this.emitChanged(guildId);
    return toDto(updated);
  }

  async remove(guildId: string, roleId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    if (role.isOwnerRole) throw new ForbiddenException('Роль «Владелец» нельзя удалить');
    if (role.isDefault) throw new BadRequestException('Базовую роль «Участник» нельзя удалить');
    await this.prisma.role.delete({ where: { id: roleId } });
    this.emitChanged(guildId);
  }

  async assign(guildId: string, actorId: string, userId: string, roleId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    await this.assertCanGrantAdmin(guildId, actorId, role.permissions);
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!member) throw new NotFoundException('Пользователь не участник этого сервера');
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    this.emitChanged(guildId);
  }

  async unassign(guildId: string, roleId: string, userId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    if (role.isOwnerRole) throw new ForbiddenException('Нельзя снять роль «Владелец»');
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    this.emitChanged(guildId);
  }

  private emitChanged(guildId: string): void {
    this.ws.emitToGuild(guildId, WsEvents.GuildRolesChanged, { guildId });
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
  }
}
