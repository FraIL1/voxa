import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Attachment,
  type DmConversation,
  type DmMessage,
  type DmReaction,
  type User,
} from '@prisma/client';
import {
  WsEvents,
  type DmConversationDto,
  type DmMessageDto,
  type DmMessagesPageDto,
  type EditDmInput,
  type MessagesQueryInput,
  type SendDmInput,
} from '@voxa/shared';

import { FilesService } from '../files/files.service';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

const EXCERPT_LENGTH = 140;
const MAX_DISTINCT_REACTIONS = 20;
const MAX_PINNED = 50;
const SEARCH_LIMIT = 50;
const PREVIEW_LENGTH = 100;

type DmMessageWithRelations = DmMessage & {
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  attachments: Attachment[];
  reactions: Pick<DmReaction, 'emoji' | 'userId'>[];
  replyTo:
    | (Pick<DmMessage, 'id' | 'content' | 'deletedAt'> & { author: Pick<User, 'username'> | null })
    | null;
};

const AUTHOR_SELECT = {
  select: { id: true, username: true, displayName: true, avatarUrl: true },
} as const;

const DM_INCLUDE = {
  author: AUTHOR_SELECT,
  attachments: true,
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
  replyTo: {
    select: { id: true, content: true, deletedAt: true, author: { select: { username: true } } },
  },
} as const;

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly friends: FriendsService,
    private readonly ws: WsGateway,
  ) {}

  /** Канонический порядок пары: меньший uuid — userA (одна строка на двоих) */
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private peerIdOf(
    conversation: Pick<DmConversation, 'userAId' | 'userBId'>,
    meId: string,
  ): string {
    return conversation.userAId === meId ? conversation.userBId : conversation.userAId;
  }

  private async assertParticipant(conversationId: string, userId: string): Promise<DmConversation> {
    const conversation = await this.prisma.dmConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Диалог не найден');
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException('Нет доступа к этому диалогу');
    }
    return conversation;
  }

  private toMessageDto(message: DmMessageWithRelations): Promise<DmMessageDto> {
    return (async () => ({
      id: message.id,
      conversationId: message.conversationId,
      author: message.author
        ? {
            id: message.author.id,
            username: message.author.username,
            displayName: message.author.displayName,
            avatarUrl: message.author.avatarUrl,
          }
        : null,
      content: message.content,
      replyToId: message.replyToId,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            authorUsername: message.replyTo.author?.username ?? null,
            excerpt: message.replyTo.deletedAt
              ? null
              : message.replyTo.content.slice(0, EXCERPT_LENGTH),
          }
        : null,
      attachments: await Promise.all(message.attachments.map((a) => this.files.toDto(a))),
      reactions: message.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
      pinnedAt: message.pinnedAt?.toISOString() ?? null,
      editedAt: message.editedAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    }))();
  }

  /** Открыть (или создать) диалог с пользователем; возвращает id */
  async openConversation(meId: string, peerId: string): Promise<{ id: string }> {
    if (meId === peerId) throw new BadRequestException('Нельзя написать самому себе');
    const peer = await this.prisma.user.findUnique({ where: { id: peerId }, select: { id: true } });
    if (!peer) throw new NotFoundException('Пользователь не найден');
    await this.friends.assertNotBlocked(meId, peerId);

    const [userAId, userBId] = this.orderPair(meId, peerId);
    const conversation = await this.prisma.dmConversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
      select: { id: true },
    });
    return conversation;
  }

  private async unreadCount(
    conversationId: string,
    userId: string,
    lastReadMessageId: string | null,
  ): Promise<number> {
    return this.prisma.dmMessage.count({
      where: {
        conversationId,
        deletedAt: null,
        authorId: { not: userId },
        ...(lastReadMessageId ? { id: { gt: lastReadMessageId } } : {}),
      },
    });
  }

  /** Список диалогов пользователя (свежие сверху), с превью и непрочитанными */
  async listConversations(meId: string): Promise<DmConversationDto[]> {
    const conversations = await this.prisma.dmConversation.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        userA: AUTHOR_SELECT,
        userB: AUTHOR_SELECT,
        readStates: { where: { userId: meId } },
        messages: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
          take: 1,
          select: { content: true, authorId: true, createdAt: true },
        },
      },
    });

    const list = await Promise.all(
      conversations.map(async (c) => {
        const peer = c.userAId === meId ? c.userB : c.userA;
        const lastRead = c.readStates[0]?.lastReadMessageId ?? null;
        const last = c.messages[0];
        return {
          id: c.id,
          peer: {
            id: peer.id,
            username: peer.username,
            displayName: peer.displayName,
            avatarUrl: peer.avatarUrl,
          },
          lastMessage: last
            ? {
                content: last.content.slice(0, PREVIEW_LENGTH),
                authorId: last.authorId,
                createdAt: last.createdAt.toISOString(),
              }
            : null,
          unreadCount: await this.unreadCount(c.id, meId, lastRead),
          lastMessageAt: c.lastMessageAt.toISOString(),
          pinned: c.readStates[0]?.pinned ?? false,
        };
      }),
    );
    // Закреплённые диалоги — всегда сверху, внутри групп по свежести
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  /** Диалог как DTO (для перехода после open) */
  async conversationDto(meId: string, conversationId: string): Promise<DmConversationDto> {
    const conversation = await this.assertParticipant(conversationId, meId);
    const peerId = this.peerIdOf(conversation, meId);
    const peer = await this.prisma.user.findUniqueOrThrow({
      where: { id: peerId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    const state = await this.prisma.dmReadState.findUnique({
      where: { conversationId_userId: { conversationId, userId: meId } },
    });
    const last = await this.prisma.dmMessage.findFirst({
      where: { conversationId, deletedAt: null },
      orderBy: { id: 'desc' },
      select: { content: true, authorId: true, createdAt: true },
    });
    return {
      id: conversation.id,
      peer,
      lastMessage: last
        ? {
            content: last.content.slice(0, PREVIEW_LENGTH),
            authorId: last.authorId,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unreadCount: await this.unreadCount(conversationId, meId, state?.lastReadMessageId ?? null),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      pinned: state?.pinned ?? false,
    };
  }

  async history(
    meId: string,
    conversationId: string,
    query: MessagesQueryInput,
  ): Promise<DmMessagesPageDto> {
    await this.assertParticipant(conversationId, meId);
    const messages = await this.prisma.dmMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
      include: DM_INCLUDE,
    });
    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;
    return { items: await Promise.all(page.map((m) => this.toMessageDto(m))), hasMore };
  }

  async send(meId: string, conversationId: string, input: SendDmInput): Promise<DmMessageDto> {
    const conversation = await this.assertParticipant(conversationId, meId);
    await this.friends.assertNotBlocked(meId, this.peerIdOf(conversation, meId));

    if (input.replyToId) {
      const target = await this.prisma.dmMessage.findFirst({
        where: { id: input.replyToId, conversationId, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw new BadRequestException('Сообщение, на которое вы отвечаете, не найдено');
    }

    const created = await this.prisma.dmMessage.create({
      data: {
        conversationId,
        authorId: meId,
        content: input.content,
        replyToId: input.replyToId ?? null,
      },
    });

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await this.files.attachToDmMessage(meId, created.id, input.attachmentIds);
    }

    await this.prisma.dmConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    const full = await this.prisma.dmMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: DM_INCLUDE,
    });
    const dto = await this.toMessageDto(full);

    // Оба участника получают сообщение и обновление превью диалога
    const both = [conversation.userAId, conversation.userBId];
    this.ws.emitToUsers(both, WsEvents.DmMessageNew, dto);
    for (const uid of both) {
      this.ws.emitToUsers(
        [uid],
        WsEvents.DmConversationUpdated,
        await this.conversationDto(uid, conversationId),
      );
    }
    return dto;
  }

  async edit(
    meId: string,
    conversationId: string,
    messageId: string,
    input: EditDmInput,
  ): Promise<DmMessageDto> {
    const conversation = await this.assertParticipant(conversationId, meId);
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== meId)
      throw new ForbiddenException('Редактировать можно только свои сообщения');

    await this.prisma.dmMessage.update({
      where: { id: messageId },
      data: { content: input.content, editedAt: new Date() },
    });
    const full = await this.prisma.dmMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: DM_INCLUDE,
    });
    const dto = await this.toMessageDto(full);
    this.ws.emitToUsers(
      [conversation.userAId, conversation.userBId],
      WsEvents.DmMessageEdited,
      dto,
    );
    return dto;
  }

  async remove(meId: string, conversationId: string, messageId: string): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, meId);
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== meId)
      throw new ForbiddenException('Удалять можно только свои сообщения');

    await this.prisma.dmMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    this.ws.emitToUsers([conversation.userAId, conversation.userBId], WsEvents.DmMessageDeleted, {
      id: messageId,
      conversationId,
    });
  }

  /** Отметить прочитанным до messageId (курсор только вперёд) */
  async ack(meId: string, conversationId: string, messageId: string): Promise<void> {
    await this.assertParticipant(conversationId, meId);
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');

    const existing = await this.prisma.dmReadState.findUnique({
      where: { conversationId_userId: { conversationId, userId: meId } },
    });
    const target =
      existing?.lastReadMessageId && existing.lastReadMessageId >= messageId
        ? existing.lastReadMessageId
        : messageId;

    await this.prisma.dmReadState.upsert({
      where: { conversationId_userId: { conversationId, userId: meId } },
      create: { conversationId, userId: meId, lastReadMessageId: target },
      update: { lastReadMessageId: target },
    });
    // Обновляем свой счётчик непрочитанных в списке (в других вкладках)
    this.ws.emitToUsers(
      [meId],
      WsEvents.DmConversationUpdated,
      await this.conversationDto(meId, conversationId),
    );
  }

  // ---------- Реакции ----------

  private async findAliveOrThrow(conversationId: string, messageId: string): Promise<DmMessage> {
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    return message;
  }

  async addReaction(
    meId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, meId);
    await this.findAliveOrThrow(conversationId, messageId);

    // Идемпотентность: реакция уже стоит — не ошибка и не событие
    const existing = await this.prisma.dmReaction.findUnique({
      where: { dmMessageId_userId_emoji: { dmMessageId: messageId, userId: meId, emoji } },
      select: { id: true },
    });
    if (existing) return;

    const distinct = await this.prisma.dmReaction.findMany({
      where: { dmMessageId: messageId },
      select: { emoji: true },
      distinct: ['emoji'],
    });
    if (!distinct.some((r) => r.emoji === emoji) && distinct.length >= MAX_DISTINCT_REACTIONS) {
      throw new BadRequestException('На сообщении слишком много разных реакций');
    }

    try {
      await this.prisma.dmReaction.create({
        data: { dmMessageId: messageId, userId: meId, emoji },
      });
    } catch (error) {
      // Гонка параллельных запросов: другой успел создать ту же реакцию
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }

    this.ws.emitToUsers([conversation.userAId, conversation.userBId], WsEvents.DmReactionAdded, {
      conversationId,
      messageId,
      emoji,
      userId: meId,
    });
  }

  async removeReaction(
    meId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, meId);
    const deleted = await this.prisma.dmReaction.deleteMany({
      where: { dmMessageId: messageId, userId: meId, emoji },
    });
    if (deleted.count === 0) return;

    this.ws.emitToUsers([conversation.userAId, conversation.userBId], WsEvents.DmReactionRemoved, {
      conversationId,
      messageId,
      emoji,
      userId: meId,
    });
  }

  // ---------- Закреплённые сообщения ----------

  /** Закрепить/открепить сообщение — видно обоим участникам */
  async setMessagePinned(
    meId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<DmMessageDto> {
    const conversation = await this.assertParticipant(conversationId, meId);
    await this.findAliveOrThrow(conversationId, messageId);

    if (pinned) {
      const count = await this.prisma.dmMessage.count({
        where: { conversationId, pinnedAt: { not: null } },
      });
      if (count >= MAX_PINNED) {
        throw new BadRequestException(
          `В диалоге можно закрепить не больше ${MAX_PINNED} сообщений`,
        );
      }
    }

    await this.prisma.dmMessage.update({
      where: { id: messageId },
      data: {
        pinnedAt: pinned ? new Date() : null,
        pinnedById: pinned ? meId : null,
      },
    });

    const full = await this.prisma.dmMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: DM_INCLUDE,
    });
    const dto = await this.toMessageDto(full);
    this.ws.emitToUsers(
      [conversation.userAId, conversation.userBId],
      WsEvents.DmMessageEdited,
      dto,
    );
    return dto;
  }

  /** Закреплённые сообщения диалога (свежие сверху) */
  async listPinned(meId: string, conversationId: string): Promise<DmMessageDto[]> {
    await this.assertParticipant(conversationId, meId);
    const messages = await this.prisma.dmMessage.findMany({
      where: { conversationId, deletedAt: null, pinnedAt: { not: null } },
      orderBy: { pinnedAt: 'desc' },
      include: DM_INCLUDE,
    });
    return Promise.all(messages.map((m) => this.toMessageDto(m)));
  }

  // ---------- Закрепление диалога и поиск ----------

  /** Закрепить диалог в своём списке (у каждого участника своё) */
  async setConversationPinned(
    meId: string,
    conversationId: string,
    pinned: boolean,
  ): Promise<DmConversationDto> {
    await this.assertParticipant(conversationId, meId);
    await this.prisma.dmReadState.upsert({
      where: { conversationId_userId: { conversationId, userId: meId } },
      create: { conversationId, userId: meId, pinned },
      update: { pinned },
    });
    const dto = await this.conversationDto(meId, conversationId);
    this.ws.emitToUsers([meId], WsEvents.DmConversationUpdated, dto);
    return dto;
  }

  /** Поиск по переписке: совпадения по тексту, свежие сверху */
  async search(meId: string, conversationId: string, query: string): Promise<DmMessageDto[]> {
    await this.assertParticipant(conversationId, meId);
    const messages = await this.prisma.dmMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: { id: 'desc' },
      take: SEARCH_LIMIT,
      include: DM_INCLUDE,
    });
    return Promise.all(messages.map((m) => this.toMessageDto(m)));
  }
}
