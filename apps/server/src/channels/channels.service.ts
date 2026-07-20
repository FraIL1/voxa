import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  combineMasks,
  hasPermission,
  Permissions,
  WsEvents,
  type CategoryDto,
  type ChannelDto,
  type CommunityStructureDto,
  type CreateCategoryInput,
  type CreateChannelInput,
  type UpdateCategoryInput,
  type UpdateChannelInput,
} from '@voxa/shared';
import type { Category, Channel, ChannelRoleAccess } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

type ChannelWithAccess = Channel & { allowedRoles: Pick<ChannelRoleAccess, 'roleId'>[] };

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  private toChannelDto(channel: ChannelWithAccess): ChannelDto {
    return {
      id: channel.id,
      guildId: channel.guildId,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      categoryId: channel.categoryId,
      position: channel.position,
      isPrivate: channel.isPrivate,
      allowedRoleIds: channel.isPrivate ? channel.allowedRoles.map((r) => r.roleId) : [],
    };
  }

  private toCategoryDto(category: Category, channels: ChannelDto[]): CategoryDto {
    return {
      id: category.id,
      guildId: category.guildId,
      name: category.name,
      position: category.position,
      channels,
    };
  }

  /** Структура сервера, отфильтрованная по видимости для пользователя */
  async getStructure(userId: string, guildId: string): Promise<CommunityStructureDto> {
    await this.users.assertMember(guildId, userId);
    const visibleIds = new Set(await this.users.visibleChannelIdsInGuild(userId, guildId));
    const [categories, channels] = await Promise.all([
      this.prisma.category.findMany({ where: { guildId }, orderBy: { position: 'asc' } }),
      this.prisma.channel.findMany({
        where: { guildId },
        orderBy: { position: 'asc' },
        include: { allowedRoles: { select: { roleId: true } } },
      }),
    ]);

    const visibleChannels = channels.filter((c) => visibleIds.has(c.id));
    const byCategory = new Map<string | null, ChannelDto[]>();
    for (const channel of visibleChannels) {
      const list = byCategory.get(channel.categoryId) ?? [];
      list.push(this.toChannelDto(channel));
      byCategory.set(channel.categoryId, list);
    }

    return {
      categories: categories.map((cat) => this.toCategoryDto(cat, byCategory.get(cat.id) ?? [])),
      uncategorized: byCategory.get(null) ?? [],
    };
  }

  // ---------- Категории ----------

  async createCategory(guildId: string, input: CreateCategoryInput): Promise<CategoryDto> {
    const max = await this.prisma.category.aggregate({
      _max: { position: true },
      where: { guildId },
    });
    const category = await this.prisma.category.create({
      data: { guildId, name: input.name, position: (max._max.position ?? -1) + 1 },
    });
    const dto = this.toCategoryDto(category, []);
    this.ws.emitToGuild(guildId, WsEvents.CategoryCreated, dto);
    return dto;
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Категория не найдена');

    const category = await this.prisma.category.update({
      where: { id },
      data: { name: input.name, position: input.position },
    });
    // channels в событии пустой: получатели уже знают состав из структуры,
    // здесь важны только имя и позиция
    const dto = this.toCategoryDto(category, []);
    this.ws.emitToGuild(category.guildId, WsEvents.CategoryUpdated, dto);
    return dto;
  }

  async deleteCategory(id: string): Promise<string> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Категория не найдена');

    // Каналы категории не удаляются, а становятся «вне категории» (SetNull)
    await this.prisma.category.delete({ where: { id } });
    this.ws.emitToGuild(existing.guildId, WsEvents.CategoryDeleted, { id });
    return existing.guildId;
  }

  // ---------- Каналы ----------

  async createChannel(guildId: string, input: CreateChannelInput): Promise<ChannelDto> {
    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, guildId },
      });
      if (!category) throw new BadRequestException('Категория не найдена');
    }
    const allowedRoleIds = await this.validatedRoleIds(
      guildId,
      input.isPrivate,
      input.allowedRoleIds,
    );

    const max = await this.prisma.channel.aggregate({
      _max: { position: true },
      where: { guildId, categoryId: input.categoryId ?? null },
    });

    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        name: input.name,
        type: input.type,
        topic: input.topic ?? null,
        categoryId: input.categoryId ?? null,
        position: (max._max.position ?? -1) + 1,
        isPrivate: input.isPrivate ?? false,
        allowedRoles: { create: allowedRoleIds.map((roleId) => ({ roleId })) },
      },
      include: { allowedRoles: { select: { roleId: true } } },
    });

    const dto = this.toChannelDto(channel);
    await this.broadcastChannelUpsert(channel, dto, WsEvents.ChannelCreated);
    return dto;
  }

  async updateChannel(id: string, input: UpdateChannelInput): Promise<ChannelDto> {
    const existing = await this.prisma.channel.findUnique({
      where: { id },
      include: { allowedRoles: { select: { roleId: true } } },
    });
    if (!existing) throw new NotFoundException('Канал не найден');

    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, guildId: existing.guildId },
      });
      if (!category) throw new BadRequestException('Категория не найдена');
    }

    const willBePrivate = input.isPrivate ?? existing.isPrivate;
    const allowedRoleIds =
      input.allowedRoleIds !== undefined
        ? await this.validatedRoleIds(existing.guildId, willBePrivate, input.allowedRoleIds)
        : undefined;

    const channel = await this.prisma.$transaction(async (tx) => {
      if (allowedRoleIds !== undefined) {
        await tx.channelRoleAccess.deleteMany({ where: { channelId: id } });
        await tx.channelRoleAccess.createMany({
          data: allowedRoleIds.map((roleId) => ({ channelId: id, roleId })),
        });
      }
      return tx.channel.update({
        where: { id },
        data: {
          name: input.name,
          topic: input.topic,
          categoryId: input.categoryId,
          position: input.position,
          isPrivate: input.isPrivate,
        },
        include: { allowedRoles: { select: { roleId: true } } },
      });
    });

    const dto = this.toChannelDto(channel);
    await this.broadcastChannelUpsert(channel, dto, WsEvents.ChannelUpdated);
    return dto;
  }

  async deleteChannel(id: string): Promise<string> {
    const existing = await this.prisma.channel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Канал не найден');

    await this.prisma.channel.delete({ where: { id } });
    this.ws.emitToGuild(existing.guildId, WsEvents.ChannelDeleted, { id });
    this.ws.removeChannelRoom(id);
    return existing.guildId;
  }

  /** Приватному каналу нужен непустой список ролей этого сервера */
  private async validatedRoleIds(
    guildId: string,
    isPrivate: boolean | undefined,
    roleIds: string[] | undefined,
  ): Promise<string[]> {
    if (!isPrivate) return [];
    if (!roleIds || roleIds.length === 0) {
      throw new BadRequestException('Для приватного канала укажите хотя бы одну роль');
    }
    const found = await this.prisma.role.count({ where: { id: { in: roleIds }, guildId } });
    if (found !== roleIds.length) {
      throw new BadRequestException('Некоторые из указанных ролей не существуют');
    }
    return roleIds;
  }

  /**
   * Рассылка создания/изменения канала с учётом приватности: публичный —
   * всем участникам сервера; приватный — только допущенным, остальным
   * channel.deleted (чтобы канал исчез из их списка).
   */
  private async broadcastChannelUpsert(
    channel: ChannelWithAccess,
    dto: ChannelDto,
    event: typeof WsEvents.ChannelCreated | typeof WsEvents.ChannelUpdated,
  ): Promise<void> {
    if (!channel.isPrivate) {
      this.ws.emitToGuild(channel.guildId, event, dto);
      this.ws.joinGuildToChannel(channel.guildId, channel.id);
      return;
    }

    const [guild, members] = await Promise.all([
      this.prisma.guild.findUniqueOrThrow({
        where: { id: channel.guildId },
        select: { ownerId: true },
      }),
      this.prisma.guildMember.findMany({
        where: { guildId: channel.guildId },
        select: {
          userId: true,
          user: {
            select: {
              roles: {
                where: { role: { guildId: channel.guildId } },
                select: { roleId: true, role: { select: { permissions: true } } },
              },
            },
          },
        },
      }),
    ]);

    const allowedRoleIds = new Set(channel.allowedRoles.map((r) => r.roleId));
    const allowedUserIds: string[] = [];
    const restUserIds: string[] = [];
    for (const member of members) {
      const mask = combineMasks(member.user.roles.map((r) => r.role.permissions));
      const allowed =
        member.userId === guild.ownerId ||
        hasPermission(mask, Permissions.ADMINISTRATOR) ||
        member.user.roles.some((r) => allowedRoleIds.has(r.roleId));
      (allowed ? allowedUserIds : restUserIds).push(member.userId);
    }

    this.ws.syncPrivateChannelMembership(
      channel.id,
      allowedUserIds,
      members.map((m) => m.userId),
    );
    this.ws.emitToUsers(allowedUserIds, event, dto);
    if (event === WsEvents.ChannelUpdated) {
      // потерявшим доступ канал «исчезает»
      this.ws.emitToUsers(restUserIds, WsEvents.ChannelDeleted, { id: channel.id });
    }
  }
}
