import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Attachment, Message, Reaction, User } from '@prisma/client';
import {
  hasPermission,
  MENTION_PATTERN,
  Permissions,
  WsEvents,
  type EditMessageInput,
  type LinkPreviewDto,
  type MessageDto,
  type MessagesPageDto,
  type MessagesQueryInput,
  type SendMessageInput,
} from '@voxa/shared';

import { FilesService } from '../files/files.service';
import { LinkPreviewService } from '../link-preview/link-preview.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReadStatesService } from '../read-states/read-states.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

const EXCERPT_LENGTH = 140;
/** Максимум различных эмодзи на одном сообщении */
const MAX_DISTINCT_REACTIONS = 20;

type MessageWithRelations = Message & {
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  reactions: Pick<Reaction, 'emoji' | 'userId'>[];
  attachments: Attachment[];
  replyTo:
    | (Pick<Message, 'id' | 'content' | 'deletedAt'> & {
        author: Pick<User, 'username'> | null;
      })
    | null;
};

const AUTHOR_SELECT = {
  select: { id: true, username: true, displayName: true, avatarUrl: true },
} as const;

const MESSAGE_INCLUDE = {
  author: AUTHOR_SELECT,
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
  attachments: true,
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      author: { select: { username: true } },
    },
  },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
    private readonly readStates: ReadStatesService,
    private readonly files: FilesService,
    private readonly linkPreview: LinkPreviewService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Адресаты упоминаний: @имя (существующие пользователи, которым виден
   * канал) и @everyone (все видящие канал; требует права MENTION_EVERYONE).
   * Автор из списка исключается.
   */
  private async resolveMentions(
    content: string,
    authorId: string,
    channelId: string,
  ): Promise<string[]> {
    const hasEveryone = /@everyone(?![\p{L}\p{N}_.-])/u.test(content);
    const names = new Set<string>();
    for (const match of content.matchAll(MENTION_PATTERN)) {
      const name = (match[1] as string).toLowerCase();
      if (name !== 'everyone') names.add(name);
    }
    if (!hasEveryone && names.size === 0) return [];

    const visible = new Set(await this.users.visibleUserIdsOfChannel(channelId));
    const targets = new Set<string>();

    if (hasEveryone) {
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { guildId: true },
      });
      const mask = await this.users.permissionMaskOf(authorId, channel.guildId);
      if (hasPermission(mask, Permissions.MENTION_EVERYONE)) {
        for (const id of visible) targets.add(id);
      }
    }
    if (names.size > 0) {
      const mentioned = await this.prisma.user.findMany({
        where: { usernameLower: { in: [...names] } },
        select: { id: true },
      });
      for (const { id } of mentioned) {
        if (visible.has(id)) targets.add(id);
      }
    }

    targets.delete(authorId);
    return [...targets];
  }

  private async toDto(message: MessageWithRelations): Promise<MessageDto> {
    return {
      id: message.id,
      channelId: message.channelId,
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
      reactions: message.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
      attachments: await Promise.all(message.attachments.map((a) => this.files.toDto(a))),
      linkPreview: (message.linkPreview as LinkPreviewDto | null) ?? null,
      editedAt: message.editedAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /**
   * Асинхронное превью первой ссылки: сообщение уже доставлено, карточка
   * догоняет событием message.edit. Ошибки сети глотаются.
   */
  private attachLinkPreviewLater(messageId: string, channelId: string, content: string): void {
    const url = this.linkPreview.extractFirstUrl(content);
    if (!url) return;

    void (async () => {
      const preview = await this.linkPreview.fetchPreview(url);
      if (!preview) return;
      const updated = await this.prisma.message.update({
        where: { id: messageId },
        data: { linkPreview: preview as unknown as Prisma.InputJsonValue },
        include: MESSAGE_INCLUDE,
      });
      if (updated.deletedAt) return; // удалили, пока ходили за превью
      this.ws.emitToChannel(channelId, WsEvents.MessageEdited, await this.toDto(updated));
    })().catch(() => undefined);
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

  /** Живое сообщение в этом канале — иначе 404 */
  private async findAliveOrThrow(
    channelId: string,
    messageId: string,
  ): Promise<MessageWithRelations> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId, deletedAt: null },
      include: MESSAGE_INCLUDE,
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    return message;
  }

  /** Активный таймаут запрещает писать и говорить (раздел 5.10 PRD) */
  private async assertNotTimedOut(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timedOutUntil: true },
    });
    if (user?.timedOutUntil && user.timedOutUntil > new Date()) {
      throw new ForbiddenException(
        `Вы в таймауте до ${user.timedOutUntil.toLocaleString('ru-RU')}`,
      );
    }
  }

  async send(userId: string, channelId: string, input: SendMessageInput): Promise<MessageDto> {
    await this.assertNotTimedOut(userId);
    await this.assertTextChannelAccess(userId, channelId);

    // Вложения в канал сервера требуют права UPLOAD_FILES на этом сервере
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { guildId: true },
      });
      const mask = await this.users.permissionMaskOf(userId, channel.guildId);
      if (!hasPermission(mask, Permissions.UPLOAD_FILES)) {
        throw new ForbiddenException('Недостаточно прав для загрузки файлов');
      }
    }

    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, channelId, deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException('Сообщение, на которое вы отвечаете, не найдено');
      }
    }

    const created = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: input.content,
        replyToId: input.replyToId ?? null,
      },
      select: { id: true },
    });

    // Вложения: только свои и ещё не привязанные
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      try {
        await this.files.attachToMessage(userId, created.id, input.attachmentIds);
      } catch (error) {
        await this.prisma.message.delete({ where: { id: created.id } });
        throw error;
      }
    }

    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: created.id },
      include: MESSAGE_INCLUDE,
    });
    const dto = await this.toDto(message);

    const mentionedUserIds = await this.resolveMentions(input.content, userId, channelId);
    if (mentionedUserIds.length > 0) {
      await this.readStates.incrementMentions(channelId, mentionedUserIds);
    }

    // mentionedUserIds — только в WS-событии: клиент по нему решает,
    // увеличивать ли свой счётчик упоминаний
    this.ws.emitToChannel(channelId, WsEvents.MessageNew, { ...dto, mentionedUserIds });
    this.attachLinkPreviewLater(created.id, channelId, input.content);
    return dto;
  }

  /** Редактировать может только автор (модераторы — нет, как в Discord) */
  async edit(
    userId: string,
    channelId: string,
    messageId: string,
    input: EditMessageInput,
  ): Promise<MessageDto> {
    await this.assertTextChannelAccess(userId, channelId);
    const message = await this.findAliveOrThrow(channelId, messageId);

    if (message.authorId !== userId) {
      throw new ForbiddenException('Редактировать можно только свои сообщения');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: input.content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });

    const dto = await this.toDto(updated);
    this.ws.emitToChannel(channelId, WsEvents.MessageEdited, dto);
    return dto;
  }

  /** Удаляет автор или обладатель права DELETE_MESSAGES (мягкое удаление) */
  async remove(userId: string, channelId: string, messageId: string): Promise<void> {
    await this.assertTextChannelAccess(userId, channelId);
    const message = await this.findAliveOrThrow(channelId, messageId);

    const isForeign = message.authorId !== userId;
    if (isForeign) {
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { guildId: true },
      });
      const mask = await this.users.permissionMaskOf(userId, channel.guildId);
      if (!hasPermission(mask, Permissions.DELETE_MESSAGES)) {
        throw new ForbiddenException('Недостаточно прав для удаления чужого сообщения');
      }
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    // Удаление чужого — модерационное действие, фиксируем в журнале
    if (isForeign) {
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { guildId: true },
      });
      this.audit.log(
        channel.guildId,
        userId,
        'message.delete.other',
        { type: 'message', id: messageId },
        {
          channelId,
          authorId: message.authorId,
        },
      );
    }

    this.ws.emitToChannel(channelId, WsEvents.MessageDeleted, { id: messageId, channelId });
  }

  async addReaction(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.assertTextChannelAccess(userId, channelId);
    await this.findAliveOrThrow(channelId, messageId);

    // Идемпотентность: реакция уже стоит — не ошибка и не событие
    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      select: { id: true },
    });
    if (existing) return;

    const distinct = await this.prisma.reaction.findMany({
      where: { messageId },
      select: { emoji: true },
      distinct: ['emoji'],
    });
    const isNewEmoji = !distinct.some((r) => r.emoji === emoji);
    if (isNewEmoji && distinct.length >= MAX_DISTINCT_REACTIONS) {
      throw new BadRequestException('На сообщении слишком много разных реакций');
    }

    try {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
    } catch (error) {
      // Гонка параллельных запросов: другой запрос успел создать ту же реакцию
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }

    this.ws.emitToChannel(channelId, WsEvents.ReactionAdded, {
      channelId,
      messageId,
      emoji,
      userId,
    });
  }

  async removeReaction(
    userId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.assertTextChannelAccess(userId, channelId);
    await this.findAliveOrThrow(channelId, messageId);

    const { count } = await this.prisma.reaction.deleteMany({
      where: { messageId, userId, emoji },
    });
    if (count === 0) return; // нечего убирать — не событие

    this.ws.emitToChannel(channelId, WsEvents.ReactionRemoved, {
      channelId,
      messageId,
      emoji,
      userId,
    });
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
      include: MESSAGE_INCLUDE,
    });

    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;
    return { items: await Promise.all(page.map((m) => this.toDto(m))), hasMore };
  }
}
