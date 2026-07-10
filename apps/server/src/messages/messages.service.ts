import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  WsEvents,
  type MessageDto,
  type MessagesPageDto,
  type MessagesQueryInput,
  type SendMessageInput,
} from '@voxa/shared';
import type { Message, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'username' | 'avatarUrl'> | null;
};

const AUTHOR_SELECT = { select: { id: true, username: true, avatarUrl: true } } as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  private toDto(message: MessageWithAuthor): MessageDto {
    return {
      id: message.id,
      channelId: message.channelId,
      author: message.author
        ? {
            id: message.author.id,
            username: message.author.username,
            avatarUrl: message.author.avatarUrl,
          }
        : null,
      content: message.content,
      replyToId: message.replyToId,
      editedAt: message.editedAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** Канал существует, текстовый и виден пользователю — иначе 404 (не раскрываем приватные) */
  private async assertTextChannelAccess(userId: string, channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || !(await this.users.canSeeChannel(userId, channelId))) {
      throw new NotFoundException('Канал не найден');
    }
    if (channel.type !== 'TEXT') {
      throw new BadRequestException('Сообщения можно отправлять только в текстовые каналы');
    }
  }

  async send(userId: string, channelId: string, input: SendMessageInput): Promise<MessageDto> {
    await this.assertTextChannelAccess(userId, channelId);

    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, channelId, deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException('Сообщение, на которое вы отвечаете, не найдено');
      }
    }

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: input.content,
        replyToId: input.replyToId ?? null,
      },
      include: { author: AUTHOR_SELECT },
    });

    const dto = this.toDto(message);
    this.ws.emitToChannel(channelId, WsEvents.MessageNew, dto);
    return dto;
  }

  /** История канала: от новых к старым, курсор — id сообщения (uuid v7 монотонен) */
  async history(
    userId: string,
    channelId: string,
    query: MessagesQueryInput,
  ): Promise<MessagesPageDto> {
    await this.assertTextChannelAccess(userId, channelId);

    const messages = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
      include: { author: AUTHOR_SELECT },
    });

    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;
    return { items: page.map((m) => this.toDto(m)), hasMore };
  }
}
