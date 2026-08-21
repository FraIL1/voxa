import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { combineMasks, hasPermission, Permissions } from '@voxa/shared';
import type {
  MeDto,
  MemberDto,
  PresenceStatus,
  ProfileRelation,
  UpdatePresenceInput,
  UserNoteInput,
  UpdateProfileInput,
  UserProfileDto,
} from '@voxa/shared';

import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

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

  /**
   * Кому вообще есть дело до этого человека: соседи по серверам, друзья и
   * собеседники в личке. Плюс он сам — своё присутствие показывается в
   * карточке внизу.
   *
   * По этому списку рассылаются присутствие и смена профиля. Раньше они
   * летели всем подряд, и посторонний узнавал логин и время появления
   * человека, с которым у него нет ни общих серверов, ни переписки.
   */
  async observerIdsOf(userId: string): Promise<string[]> {
    const [guildMates, friendships, dmMates] = await Promise.all([
      this.prisma.guildMember.findMany({
        where: { guild: { members: { some: { userId } } } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      // Только принятая дружба: иначе присутствие узнавали бы рассылкой заявок
      this.prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
        select: { requesterId: true, addresseeId: true },
      }),
      this.prisma.dmParticipant.findMany({
        where: { conversation: { participants: { some: { userId } } } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const ids = new Set<string>([userId]);
    for (const mate of guildMates) ids.add(mate.userId);
    for (const friendship of friendships) {
      ids.add(friendship.requesterId);
      ids.add(friendship.addresseeId);
    }
    for (const mate of dmMates) ids.add(mate.userId);
    return [...ids];
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
   * Старшинство человека на сервере — позиция его высшей роли.
   *
   * Владелец выше всех всегда, даже если ролей у него нет. Без ролей — −1,
   * то есть ниже любой роли: обычного участника может модерировать любой,
   * у кого есть на это право.
   */
  async topRolePositionOf(guildId: string, userId: string): Promise<number> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (guild?.ownerId === userId) return Number.POSITIVE_INFINITY;

    const top = await this.prisma.role.findFirst({
      where: { guildId, members: { some: { userId } } },
      select: { position: true },
      orderBy: { position: 'desc' },
    });
    return top?.position ?? -1;
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
  async listMembers(
    guildId: string,
    statusOf: (userId: string) => PresenceStatus,
  ): Promise<MemberDto[]> {
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
        status: statusOf(member.user.id),
        statusText: member.user.statusText,
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

  /** Смена профиля: имя, рассказ о себе, акцентный цвет (@username неизменяем) */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<MeDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        // Пустая строка — осознанная очистка поля, undefined — «не трогать»
        ...(input.bio === undefined ? {} : { bio: input.bio === '' ? null : input.bio }),
        ...(input.accentColor === undefined
          ? {}
          : { accentColor: input.accentColor === '' ? null : input.accentColor }),
      },
    });
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
      isInstanceOwner: user.isInstanceOwner,
      presenceMode: user.presenceMode,
      statusText: user.statusText,
      bio: user.bio,
      accentColor: user.accentColor,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Быстрая смена присутствия: режим и своя строчка статуса */
  async updatePresence(userId: string, input: UpdatePresenceInput): Promise<MeDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.mode === undefined ? {} : { presenceMode: input.mode }),
        ...(input.statusText === undefined
          ? {}
          : { statusText: input.statusText === '' ? null : input.statusText }),
      },
    });
    return this.getMe(userId);
  }

  /**
   * Замена аватара: картинка уходит в S3, прошлый файл удаляется, в базе
   * остаётся стабильная ссылка на наш маршрут отдачи.
   */
  async setAvatar(userId: string, buffer: Buffer): Promise<MeDto> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    const key = await this.files.storeAvatar(userId, buffer);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key, avatarUrl: `/api/${key}` },
    });
    if (before?.avatarKey) await this.files.removeObject(before.avatarKey);
    return this.getMe(userId);
  }

  async removeAvatar(userId: string): Promise<MeDto> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null, avatarUrl: null },
    });
    if (before?.avatarKey) await this.files.removeObject(before.avatarKey);
    return this.getMe(userId);
  }

  /**
   * Карточка профиля глазами другого пользователя: кто он, как мы связаны,
   * где пересекаемся. Открыта всем — списки серверов и друзей уже публичны
   * внутри инстанса, а лишнего (почта, сессии) карточка не содержит.
   */
  async getProfile(
    meId: string,
    userId: string,
    statusOf: (userId: string) => PresenceStatus,
  ): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const [friendship, block, mutualGuilds, mutualFriends, myNote] = await Promise.all([
      meId === userId
        ? null
        : this.prisma.friendship.findFirst({
            where: {
              OR: [
                { requesterId: meId, addresseeId: userId },
                { requesterId: userId, addresseeId: meId },
              ],
            },
          }),
      meId === userId
        ? null
        : this.prisma.userBlock.findUnique({
            where: { blockerId_blockedId: { blockerId: meId, blockedId: userId } },
          }),
      this.prisma.guild.findMany({
        where: {
          AND: [{ members: { some: { userId } } }, { members: { some: { userId: meId } } }],
        },
        select: { id: true, name: true, iconUrl: true },
        orderBy: { name: 'asc' },
      }),
      meId === userId ? 0 : this.countMutualFriends(meId, userId),
      this.prisma.userNote.findUnique({
        where: { ownerId_targetId: { ownerId: meId, targetId: userId } },
        select: { note: true, alias: true },
      }),
    ]);

    let relation: ProfileRelation = 'none';
    if (meId === userId) relation = 'self';
    else if (friendship?.status === 'ACCEPTED') relation = 'friends';
    else if (friendship?.status === 'PENDING') {
      relation = friendship.requesterId === meId ? 'outgoing' : 'incoming';
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      statusText: user.statusText,
      myNote: myNote?.note ?? null,
      myAlias: myNote?.alias ?? null,
      accentColor: user.accentColor,
      createdAt: user.createdAt.toISOString(),
      status: statusOf(user.id),
      isInstanceOwner: user.isInstanceOwner,
      relation,
      blocked: block !== null,
      mutualGuilds,
      mutualFriends,
    };
  }

  /**
   * Заметка о человеке и своё имя для него. Видит только автор: это личные
   * пометки, а не изменение чужого профиля. Пустая строка снимает значение.
   */
  async setNote(
    ownerId: string,
    targetId: string,
    input: UserNoteInput,
  ): Promise<{ note: string | null; alias: string | null }> {
    if (ownerId === targetId) throw new ForbiddenException('Заметка о себе не нужна');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');

    const data = {
      ...(input.note === undefined ? {} : { note: input.note === '' ? null : input.note }),
      ...(input.alias === undefined ? {} : { alias: input.alias === '' ? null : input.alias }),
    };
    const row = await this.prisma.userNote.upsert({
      where: { ownerId_targetId: { ownerId, targetId } },
      create: { ownerId, targetId, ...data },
      update: data,
      select: { note: true, alias: true },
    });
    return row;
  }

  /** Мои имена для перечисленных людей: userId → как я его называю */
  async aliasesOf(ownerId: string, targetIds: string[]): Promise<Map<string, string>> {
    if (targetIds.length === 0) return new Map();
    const rows = await this.prisma.userNote.findMany({
      where: { ownerId, targetId: { in: targetIds }, alias: { not: null } },
      select: { targetId: true, alias: true },
    });
    return new Map(rows.map((r) => [r.targetId, r.alias as string]));
  }

  /** Сколько друзей у нас общих (по принятым дружбам обеих сторон) */
  private async countMutualFriends(meId: string, userId: string): Promise<number> {
    const [mine, theirs] = await Promise.all([this.friendIdsOf(meId), this.friendIdsOf(userId)]);
    const set = new Set(mine);
    return theirs.filter((id) => set.has(id)).length;
  }

  private async friendIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }
}
