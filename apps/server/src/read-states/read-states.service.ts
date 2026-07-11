import { Injectable, NotFoundException } from '@nestjs/common';
import { WsEvents, type ReadStateDto } from '@voxa/shared';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

@Injectable()
export class ReadStatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  /** Непрочитанные после курсора; свои сообщения непрочитанными не считаются */
  private countUnread(
    userId: string,
    channelId: string,
    lastReadMessageId: string | null,
  ): Promise<number> {
    return this.prisma.message.count({
      where: {
        channelId,
        deletedAt: null,
        ...(lastReadMessageId ? { id: { gt: lastReadMessageId } } : {}),
        OR: [{ authorId: null }, { authorId: { not: userId } }],
      },
    });
  }

  /** Состояние прочитанности всех видимых текстовых каналов */
  async listFor(userId: string): Promise<ReadStateDto[]> {
    const visibleIds = await this.users.visibleChannelIdsOf(userId);
    const channels = await this.prisma.channel.findMany({
      where: { id: { in: visibleIds }, type: 'TEXT' },
      select: { id: true },
    });

    const states = await this.prisma.channelReadState.findMany({ where: { userId } });
    const byChannel = new Map(states.map((s) => [s.channelId, s]));

    return Promise.all(
      channels.map(async ({ id }) => {
        const state = byChannel.get(id);
        const lastReadMessageId = state?.lastReadMessageId ?? null;
        return {
          channelId: id,
          lastReadMessageId,
          unreadCount: await this.countUnread(userId, id, lastReadMessageId),
          mentionCount: state?.mentionCount ?? 0,
        };
      }),
    );
  }

  /** Отметка «прочитано до messageId»; курсор двигается только вперёд */
  async ack(userId: string, channelId: string, messageId: string): Promise<ReadStateDto> {
    const canSee = await this.users.canSeeChannel(userId, channelId);
    // Сообщение должно существовать в этом канале (мягко удалённое — тоже валидный курсор)
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      select: { id: true },
    });
    if (!canSee || !message) throw new NotFoundException('Сообщение не найдено');

    const existing = await this.prisma.channelReadState.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    // uuid v7 монотонен, сравнение строк корректно упорядочивает по времени
    const target =
      existing?.lastReadMessageId && existing.lastReadMessageId >= messageId
        ? existing.lastReadMessageId
        : messageId;

    const state = await this.prisma.channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, lastReadMessageId: target, mentionCount: 0 },
      update: { lastReadMessageId: target, mentionCount: 0 },
    });

    // Синхронизация между вкладками и устройствами этого же пользователя
    this.ws.emitToUsers([userId], WsEvents.ReadStateUpdated, {
      channelId,
      lastReadMessageId: state.lastReadMessageId,
    });

    return {
      channelId,
      lastReadMessageId: state.lastReadMessageId,
      unreadCount: await this.countUnread(userId, channelId, state.lastReadMessageId),
      mentionCount: 0,
    };
  }

  /** +1 к счётчику упоминаний адресатов (вызывает MessagesService при отправке) */
  async incrementMentions(channelId: string, userIds: string[]): Promise<void> {
    await Promise.all(
      userIds.map((userId) =>
        this.prisma.channelReadState.upsert({
          where: { userId_channelId: { userId, channelId } },
          create: { userId, channelId, mentionCount: 1 },
          update: { mentionCount: { increment: 1 } },
        }),
      ),
    );
  }
}
