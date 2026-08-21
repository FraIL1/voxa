import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  hasPermission,
  Permissions,
  WsEvents,
  type CreateRoleInput,
  type RoleDto,
  type UpdateRoleInput,
} from '@voxa/shared';
import type { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

function toDto(role: Role, memberCount = 0): RoleDto {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    permissions: role.permissions,
    position: role.position,
    isDefault: role.isDefault,
    isOwnerRole: role.isOwnerRole,
    memberCount,
  };
}

/** Полномочия того, кто выполняет действие над ролями */
interface Authority {
  isOwner: boolean;
  /** Объединённая маска прав всех его ролей на этом сервере */
  mask: number;
  /** Позиция его высшей роли; у владельца — +∞ */
  topPosition: number;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  async list(guildId: string): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      where: { guildId },
      orderBy: { position: 'desc' },
    });

    /* Считаем одним запросом, а не по роли: список ролей открывают часто,
       и десяток отдельных подсчётов заметно нагружал бы базу. */
    const counts = await this.prisma.userRole.groupBy({
      by: ['roleId'],
      where: { role: { guildId } },
      _count: { roleId: true },
    });
    const byRole = new Map<string, number>(counts.map((row) => [row.roleId, row._count.roleId]));

    return roles.map((role) => toDto(role, byRole.get(role.id) ?? 0));
  }

  private async assertRoleOfGuild(guildId: string, roleId: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, guildId } });
    if (!role) throw new NotFoundException('Роль не найдена');
    return role;
  }

  /** Кто действует: владелец, его права и старшинство */
  private async authorityOf(guildId: string, actorId: string): Promise<Authority> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (guild.ownerId === actorId) {
      return {
        isOwner: true,
        mask: Permissions.ADMINISTRATOR,
        topPosition: Number.POSITIVE_INFINITY,
      };
    }

    const [mask, topPosition] = await Promise.all([
      this.users.permissionMaskOf(actorId, guildId),
      this.users.topRolePositionOf(guildId, actorId),
    ]);
    return { isOwner: false, mask, topPosition };
  }

  /**
   * Выдавать можно только те права, которые есть у самого себя.
   *
   * Раньше проверялся один бит ADMINISTRATOR, и право «Управление ролями»
   * означало захват сервера: обладатель дописывал своей же роли бан, кик и
   * управление каналами и становился сильнее всех, кроме владельца.
   */
  private assertGrantable(actor: Authority, permissions: number): void {
    if ((permissions & Permissions.ADMINISTRATOR) !== 0 && !actor.isOwner) {
      throw new ForbiddenException('Право «Администратор» может выдавать только владелец сервера');
    }
    if (!hasPermission(actor.mask, permissions)) {
      throw new ForbiddenException('Нельзя выдать права, которых нет у вас самих');
    }
  }

  /**
   * Действовать можно только на роли ниже своей высшей — то же старшинство,
   * что и в модерации. Без этого роль поднималась на самый верх, а её
   * обладатель после этого мог кикать и банить тех, кто был над ним.
   */
  private assertBelowActor(actor: Authority, position: number, message: string): void {
    if (actor.isOwner) return;
    if (position >= actor.topPosition) throw new ForbiddenException(message);
  }

  async create(guildId: string, actorId: string, input: CreateRoleInput): Promise<RoleDto> {
    const actor = await this.authorityOf(guildId, actorId);
    this.assertGrantable(actor, input.permissions);

    const clash = await this.prisma.role.findFirst({ where: { guildId, name: input.name } });
    if (clash) throw new BadRequestException('Роль с таким названием уже есть');

    // Новая роль встаёт под ролью «Владелец» (position 100)
    const max = await this.prisma.role.aggregate({
      _max: { position: true },
      where: { guildId, isOwnerRole: false },
    });
    let position = Math.min((max._max.position ?? 0) + 1, 99);
    if (!actor.isOwner) {
      /* Строго ниже своей: иначе, выдав новую роль себе, обладатель
         «Управления ролями» поднялся бы над теми, кем управлять не вправе */
      position = Math.min(position, actor.topPosition - 1);
      if (position < 0) {
        throw new ForbiddenException('Ваша роль слишком низкая, чтобы создавать новые роли');
      }
    }

    const role = await this.prisma.role.create({
      data: {
        guildId,
        name: input.name,
        color: input.color ?? null,
        permissions: input.permissions,
        position,
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

    const actor = await this.authorityOf(guildId, actorId);
    this.assertBelowActor(actor, role.position, 'Нельзя изменить роль, равную вашей или старше');
    if (input.permissions !== undefined) {
      this.assertGrantable(actor, input.permissions);
    }
    if (input.position !== undefined) {
      this.assertBelowActor(
        actor,
        input.position,
        'Нельзя поднять роль до своего уровня или выше',
      );
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
        // Старшинство: без этого поля перетаскивание в настройках молча ничего не меняло
        position: input.position,
      },
    });
    this.emitChanged(guildId);
    const memberCount = await this.prisma.userRole.count({ where: { roleId } });
    return toDto(updated, memberCount);
  }

  async remove(guildId: string, actorId: string, roleId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    if (role.isOwnerRole) throw new ForbiddenException('Роль «Владелец» нельзя удалить');
    if (role.isDefault) throw new BadRequestException('Базовую роль «Участник» нельзя удалить');

    const actor = await this.authorityOf(guildId, actorId);
    this.assertBelowActor(actor, role.position, 'Нельзя удалить роль, равную вашей или старше');

    await this.prisma.role.delete({ where: { id: roleId } });
    this.emitChanged(guildId);
  }

  async assign(guildId: string, actorId: string, userId: string, roleId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);

    const actor = await this.authorityOf(guildId, actorId);
    this.assertBelowActor(actor, role.position, 'Нельзя выдать роль, равную вашей или старше');
    this.assertGrantable(actor, role.permissions);

    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!member) throw new NotFoundException('Пользователь не участник этого сервера');
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    // Роль могла открыть закрытые каналы — подписки надо пересобрать
    await this.ws.refreshRooms(userId);
    this.emitChanged(guildId);
  }

  async unassign(guildId: string, actorId: string, roleId: string, userId: string): Promise<void> {
    const role = await this.assertRoleOfGuild(guildId, roleId);
    if (role.isOwnerRole) throw new ForbiddenException('Нельзя снять роль «Владелец»');

    const actor = await this.authorityOf(guildId, actorId);
    this.assertBelowActor(actor, role.position, 'Нельзя снять роль, равную вашей или старше');

    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    /* Без этого человек, у которого сняли роль, продолжал бы получать
       сообщения из закрытого канала вживую — до перезахода в приложение */
    await this.ws.refreshRooms(userId);
    this.emitChanged(guildId);
  }

  private emitChanged(guildId: string): void {
    this.ws.emitToGuild(guildId, WsEvents.GuildRolesChanged, { guildId });
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
  }
}
