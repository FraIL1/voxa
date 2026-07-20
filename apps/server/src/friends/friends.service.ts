import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Friendship, User } from '@prisma/client';
import {
  WsEvents,
  type BlockedUserDto,
  type FriendDto,
  type FriendRequestDto,
  type FriendsUpdateReason,
  type SendFriendRequestResultDto,
} from '@voxa/shared';

import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

const USER_SELECT = { select: { id: true, username: true, avatarUrl: true } } as const;

type PublicUser = Pick<User, 'id' | 'username' | 'avatarUrl'>;

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly ws: WsGateway,
  ) {}

  /** Строка дружбы/заявки между двумя пользователями (в любом направлении) */
  private pairRow(aId: string, bId: string): Promise<Friendship | null> {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: aId, addresseeId: bId },
          { requesterId: bId, addresseeId: aId },
        ],
      },
    });
  }

  private notifyBoth(userIds: string[], reason: FriendsUpdateReason): void {
    for (const uid of userIds) {
      this.ws.emitToUsers([uid], WsEvents.FriendsUpdated, { reason });
    }
  }

  async listFriends(meId: string): Promise<FriendDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: meId }, { addresseeId: meId }] },
      include: { requester: USER_SELECT, addressee: USER_SELECT },
    });
    const online = this.presence.onlineUserIds();

    return rows
      .map((row) => {
        const peer: PublicUser = row.requesterId === meId ? row.addressee : row.requester;
        return {
          id: peer.id,
          username: peer.username,
          avatarUrl: peer.avatarUrl,
          status: online.has(peer.id) ? ('online' as const) : ('offline' as const),
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username, 'ru'));
  }

  async listRequests(meId: string): Promise<FriendRequestDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'PENDING', OR: [{ requesterId: meId }, { addresseeId: meId }] },
      include: { requester: USER_SELECT, addressee: USER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toRequestDto(row, meId));
  }

  private toRequestDto(
    row: Friendship & { requester: PublicUser; addressee: PublicUser },
    viewerId: string,
  ): FriendRequestDto {
    const incoming = row.addresseeId === viewerId;
    const user = incoming ? row.requester : row.addressee;
    return {
      id: row.id,
      direction: incoming ? 'incoming' : 'outgoing',
      user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl },
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Заявка по имени; встречная заявка превращается в дружбу сразу */
  async sendRequest(meId: string, username: string): Promise<SendFriendRequestResultDto> {
    const target = await this.prisma.user.findUnique({
      where: { usernameLower: username.toLowerCase() },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) throw new NotFoundException('Пользователь с таким именем не найден');
    if (target.id === meId) throw new BadRequestException('Нельзя добавить в друзья самого себя');

    await this.assertNotBlocked(meId, target.id);

    const existing = await this.pairRow(meId, target.id);
    if (existing) {
      if (existing.status === 'ACCEPTED') throw new BadRequestException('Вы уже друзья');
      if (existing.requesterId === meId) throw new BadRequestException('Заявка уже отправлена');
      // Встречная заявка от него — считаем это согласием
      await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED' },
      });
      this.notifyBoth([meId, target.id], 'accepted');
      return { requestId: existing.id, autoAccepted: true };
    }

    const created = await this.prisma.friendship.create({
      data: { requesterId: meId, addresseeId: target.id },
      include: { requester: USER_SELECT, addressee: USER_SELECT },
    });
    this.ws.emitToUsers(
      [target.id],
      WsEvents.FriendRequestNew,
      this.toRequestDto(created, target.id),
    );
    this.notifyBoth([meId, target.id], 'request');
    return { requestId: created.id, autoAccepted: false };
  }

  async acceptRequest(meId: string, requestId: string): Promise<void> {
    const row = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row || row.status !== 'PENDING') throw new NotFoundException('Заявка не найдена');
    if (row.addresseeId !== meId) {
      throw new ForbiddenException('Принять можно только адресованную вам заявку');
    }
    await this.prisma.friendship.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
    this.notifyBoth([row.requesterId, row.addresseeId], 'accepted');
  }

  /** Отклонить входящую или отменить свою исходящую */
  async deleteRequest(meId: string, requestId: string): Promise<void> {
    const row = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row || row.status !== 'PENDING') throw new NotFoundException('Заявка не найдена');
    if (row.requesterId !== meId && row.addresseeId !== meId) {
      throw new ForbiddenException('Это не ваша заявка');
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
    this.notifyBoth([row.requesterId, row.addresseeId], 'declined');
  }

  async removeFriend(meId: string, userId: string): Promise<void> {
    const row = await this.pairRow(meId, userId);
    if (!row || row.status !== 'ACCEPTED') throw new NotFoundException('Вы не друзья');
    await this.prisma.friendship.delete({ where: { id: row.id } });
    this.notifyBoth([meId, userId], 'removed');
  }

  async listBlocked(meId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: meId },
      include: { blocked: USER_SELECT },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.blocked.id,
      username: row.blocked.username,
      avatarUrl: row.blocked.avatarUrl,
      blockedAt: row.createdAt.toISOString(),
    }));
  }

  /** Блокировка удаляет дружбу и висящие заявки между парой */
  async block(meId: string, userId: string): Promise<void> {
    if (userId === meId) throw new BadRequestException('Нельзя заблокировать самого себя');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');

    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: meId, blockedId: userId } },
        create: { blockerId: meId, blockedId: userId },
        update: {},
      });
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: meId, addresseeId: userId },
            { requesterId: userId, addresseeId: meId },
          ],
        },
      });
    });
    this.notifyBoth([meId, userId], 'blocked');
  }

  async unblock(meId: string, userId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: meId, blockedId: userId } });
    // Блокировку видит только владелец — второй стороне сообщать нечего
    this.notifyBoth([meId], 'unblocked');
  }

  /** 403, если между пользователями есть блокировка (для заявок и ЛС) */
  async assertNotBlocked(meId: string, peerId: string): Promise<void> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: meId, blockedId: peerId },
          { blockerId: peerId, blockedId: meId },
        ],
      },
    });
    if (!block) return;
    throw new ForbiddenException(
      block.blockerId === meId
        ? 'Вы заблокировали этого пользователя — сначала разблокируйте его'
        : 'Пользователь заблокировал вас',
    );
  }
}
