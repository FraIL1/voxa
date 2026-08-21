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
  type CreateGroupDmInput,
  type DmConversationDto,
  type DmMessageDto,
  type DmMessagesPageDto,
  type EditDmInput,
  type MessagesQueryInput,
  type SendDmInput,
  type UserPublicDto,
} from '@voxa/shared';

import { FilesService } from '../files/files.service';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';

const EXCERPT_LENGTH = 140;
const MAX_DISTINCT_REACTIONS = 20;
const MAX_PINNED = 50;
const SEARCH_LIMIT = 50;
const PREVIEW_LENGTH = 100;
const MAX_GROUP_MEMBERS = 20;

type DmMessageWithRelations = DmMessage & {
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  attachments: Attachment[];
  reactions: Pick<DmReaction, 'emoji' | 'userId'>[];
  replyTo:
    | (Pick<DmMessage, 'id' | 'content' | 'deletedAt'> & { author: Pick<User, 'username'> | null })
    | null;
};

/** Диалог с участниками/прочитанностью/последним сообщением — для DTO */
interface ConversationForDto {
  id: string;
  isGroup: boolean;
  name: string | null;
  ownerId: string | null;
  lastMessageAt: Date;
  participants: { user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> }[];
  readStates: { lastReadMessageId: string | null; pinned: boolean }[];
  messages: { content: string; authorId: string | null; createdAt: Date }[];
}

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

/** include для сборки DmConversationDto под конкретного зрителя */
function conversationInclude(meId: string) {
  return {
    participants: { include: { user: AUTHOR_SELECT } },
    readStates: { where: { userId: meId }, select: { lastReadMessageId: true, pinned: true } },
    messages: {
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
      take: 1,
      select: { content: true, authorId: true, createdAt: true },
    },
  } as const;
}

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly friends: FriendsService,
    private readonly users: UsersService,
    private readonly ws: WsGateway,
  ) {}

  /**
   * Писать в личку можно другу или тому, с кем есть общий сервер —
   * иначе любой зарегистрированный мог бы написать кому угодно.
   */
  private async assertCanDm(meId: string, peerId: string): Promise<void> {
    await this.friends.assertNotBlocked(meId, peerId);
    if (await this.friends.areFriends(meId, peerId)) return;
    if (await this.users.shareGuild(meId, peerId)) return;
    throw new ForbiddenException('Написать можно другу или участнику общего с вами сервера');
  }

  /** id участников диалога */
  private async participantIdsOf(conversationId: string): Promise<string[]> {
    const parts = await this.prisma.dmParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return parts.map((p) => p.userId);
  }

  /** Проверить участие; вернуть диалог и список участников */
  private async assertParticipant(
    conversationId: string,
    userId: string,
  ): Promise<{ conversation: DmConversation; participantIds: string[] }> {
    const conversation = await this.prisma.dmConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Диалог не найден');
    const participantIds = await this.participantIdsOf(conversationId);
    if (!participantIds.includes(userId)) {
      throw new ForbiddenException('Нет доступа к этому диалогу');
    }
    return { conversation, participantIds };
  }

  /** id собеседника в 1-на-1 (для групп собеседник один не определён) */
  async peerOf(meId: string, conversationId: string): Promise<string> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (conversation.isGroup) {
      throw new BadRequestException('В беседе нет одного собеседника');
    }
    const peerId = participantIds.find((id) => id !== meId);
    if (!peerId) throw new NotFoundException('Собеседник не найден');
    await this.friends.assertNotBlocked(meId, peerId);
    return peerId;
  }

  /**
   * Данные диалога для звонка: кто участвует и как он называется.
   * Для 1-на-1 дополнительно проверяем блокировку — заблокированному
   * человеку звонить нельзя, как и писать.
   */
  async callContext(
    meId: string,
    conversationId: string,
  ): Promise<{ participantIds: string[]; isGroup: boolean; name: string | null }> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (!conversation.isGroup) {
      const peerId = participantIds.find((id) => id !== meId);
      if (peerId) await this.friends.assertNotBlocked(meId, peerId);
    }
    return { participantIds, isGroup: conversation.isGroup, name: conversation.name };
  }

  private toMessageDto(message: DmMessageWithRelations): Promise<DmMessageDto> {
    return (async () => ({
      id: message.id,
      conversationId: message.conversationId,
      kind: message.kind,
      call:
        message.kind === 'CALL'
          ? {
              startedAt: message.callStartedAt?.toISOString() ?? null,
              endedAt: message.callEndedAt?.toISOString() ?? null,
              durationSec:
                message.callStartedAt && message.callEndedAt
                  ? Math.max(
                      0,
                      Math.round(
                        (message.callEndedAt.getTime() - message.callStartedAt.getTime()) / 1000,
                      ),
                    )
                  : null,
            }
          : null,
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

  private async toConversationDto(
    meId: string,
    conv: ConversationForDto,
    mutedUntil?: Date | null,
  ): Promise<DmConversationDto> {
    const members: UserPublicDto[] = conv.participants.map((p) => ({
      id: p.user.id,
      username: p.user.username,
      displayName: p.user.displayName,
      avatarUrl: p.user.avatarUrl,
    }));
    const peer = conv.isGroup ? null : (members.find((m) => m.id !== meId) ?? null);
    const state = conv.readStates[0];
    const last = conv.messages[0];
    return {
      id: conv.id,
      isGroup: conv.isGroup,
      name: conv.name,
      ownerId: conv.ownerId,
      peer,
      members,
      lastMessage: last
        ? {
            content: last.content.slice(0, PREVIEW_LENGTH),
            authorId: last.authorId,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unreadCount: await this.unreadCount(conv.id, meId, state?.lastReadMessageId ?? null),
      lastMessageAt: conv.lastMessageAt.toISOString(),
      pinned: state?.pinned ?? false,
      mutedUntil: mutedUntil?.toISOString() ?? null,
    };
  }

  /**
   * Закрыть диалог: он пропадает из моего списка и вернётся сам, когда
   * придёт новое сообщение. Переписка при этом никуда не девается.
   */
  async hideConversation(meId: string, conversationId: string): Promise<void> {
    await this.assertParticipant(conversationId, meId);
    await this.prisma.dmParticipant.update({
      where: { conversationId_userId: { conversationId, userId: meId } },
      data: { hiddenAt: new Date() },
    });
  }

  /** Заглушить уведомления диалога: на срок или до ручного включения */
  async muteConversation(
    meId: string,
    conversationId: string,
    minutes: number | null,
  ): Promise<{ mutedUntil: string | null }> {
    await this.assertParticipant(conversationId, meId);
    // null трактуем как «пока не включу»: дата в далёком будущем
    const until =
      minutes === null
        ? new Date('2999-01-01T00:00:00.000Z')
        : new Date(Date.now() + minutes * 60_000);
    await this.prisma.dmParticipant.update({
      where: { conversationId_userId: { conversationId, userId: meId } },
      data: { mutedUntil: until },
    });
    return { mutedUntil: until.toISOString() };
  }

  async unmuteConversation(meId: string, conversationId: string): Promise<void> {
    await this.assertParticipant(conversationId, meId);
    await this.prisma.dmParticipant.update({
      where: { conversationId_userId: { conversationId, userId: meId } },
      data: { mutedUntil: null },
    });
  }

  /** Открыть (или создать) 1-на-1 диалог; возвращает id */
  async openConversation(meId: string, peerId: string): Promise<{ id: string }> {
    if (meId === peerId) throw new BadRequestException('Нельзя написать самому себе');
    const peer = await this.prisma.user.findUnique({ where: { id: peerId }, select: { id: true } });
    if (!peer) throw new NotFoundException('Пользователь не найден');
    await this.assertCanDm(meId, peerId);

    const pairKey = [meId, peerId].sort().join(':');
    const existing = await this.prisma.dmConversation.findUnique({
      where: { pairKey },
      select: { id: true },
    });
    if (existing) return existing;

    try {
      const created = await this.prisma.dmConversation.create({
        data: {
          isGroup: false,
          pairKey,
          participants: { create: [{ userId: meId }, { userId: peerId }] },
        },
        select: { id: true },
      });
      return created;
    } catch (error) {
      // Гонка: диалог создан параллельным запросом — возвращаем его
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const conv = await this.prisma.dmConversation.findUniqueOrThrow({
          where: { pairKey },
          select: { id: true },
        });
        return conv;
      }
      throw error;
    }
  }

  /** Создать групповую беседу с указанными участниками */
  async createGroup(meId: string, input: CreateGroupDmInput): Promise<DmConversationDto> {
    const memberIds = [...new Set(input.userIds)].filter((id) => id !== meId);
    if (memberIds.length < 2) {
      throw new BadRequestException('В группе должно быть минимум три участника');
    }
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`В группе не больше ${MAX_GROUP_MEMBERS} участников`);
    }
    // Каждого добавляемого создатель должен иметь право писать
    for (const id of memberIds) await this.assertCanDm(meId, id);

    const conversation = await this.prisma.dmConversation.create({
      data: {
        isGroup: true,
        name: input.name.trim(),
        ownerId: meId,
        participants: { create: [meId, ...memberIds].map((userId) => ({ userId })) },
      },
      select: { id: true },
    });

    await this.notifyAll([meId, ...memberIds], conversation.id);
    return this.conversationDto(meId, conversation.id);
  }

  /** Добавить участников в группу (любой участник может позвать своих) */
  async addMembers(
    meId: string,
    conversationId: string,
    userIds: string[],
  ): Promise<DmConversationDto> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (!conversation.isGroup) throw new BadRequestException('Это не групповая беседа');

    const toAdd = [...new Set(userIds)].filter((id) => !participantIds.includes(id));
    if (toAdd.length === 0) return this.conversationDto(meId, conversationId);
    if (participantIds.length + toAdd.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(`В группе не больше ${MAX_GROUP_MEMBERS} участников`);
    }
    for (const id of toAdd) await this.assertCanDm(meId, id);

    await this.prisma.dmParticipant.createMany({
      data: toAdd.map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });

    await this.notifyAll([...participantIds, ...toAdd], conversationId);
    return this.conversationDto(meId, conversationId);
  }

  /** Убрать участника (только владелец группы) */
  async removeMember(meId: string, conversationId: string, userId: string): Promise<void> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (!conversation.isGroup) throw new BadRequestException('Это не групповая беседа');
    if (conversation.ownerId !== meId) {
      throw new ForbiddenException('Убирать участников может только владелец группы');
    }
    if (userId === meId) throw new BadRequestException('Владелец не может убрать себя');
    if (!participantIds.includes(userId)) throw new NotFoundException('Участник не найден');

    await this.dropParticipant(conversationId, userId);
    this.ws.emitToUsers([userId], WsEvents.DmConversationRemoved, { id: conversationId });
    await this.notifyAll(
      participantIds.filter((id) => id !== userId),
      conversationId,
    );
  }

  /** Выйти из группы; владелец передаёт группу следующему или она удаляется */
  async leaveGroup(meId: string, conversationId: string): Promise<void> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (!conversation.isGroup) throw new BadRequestException('Это не групповая беседа');

    const rest = participantIds.filter((id) => id !== meId);
    await this.dropParticipant(conversationId, meId);
    this.ws.emitToUsers([meId], WsEvents.DmConversationRemoved, { id: conversationId });

    if (rest.length === 0) {
      await this.prisma.dmConversation.delete({ where: { id: conversationId } });
      return;
    }
    if (conversation.ownerId === meId) {
      await this.prisma.dmConversation.update({
        where: { id: conversationId },
        data: { ownerId: rest[0] },
      });
    }
    await this.notifyAll(rest, conversationId);
  }

  /** Переименовать группу (любой участник) */
  async renameGroup(
    meId: string,
    conversationId: string,
    name: string,
  ): Promise<DmConversationDto> {
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    if (!conversation.isGroup) throw new BadRequestException('Это не групповая беседа');
    await this.prisma.dmConversation.update({
      where: { id: conversationId },
      data: { name: name.trim() },
    });
    await this.notifyAll(participantIds, conversationId);
    return this.conversationDto(meId, conversationId);
  }

  private async dropParticipant(conversationId: string, userId: string): Promise<void> {
    await this.prisma.dmParticipant.deleteMany({ where: { conversationId, userId } });
    await this.prisma.dmReadState.deleteMany({ where: { conversationId, userId } });
  }

  /** Каждому участнику — обновление диалога с его личными непрочитанными/закреплением */
  private async notifyAll(participantIds: string[], conversationId: string): Promise<void> {
    for (const uid of participantIds) {
      this.ws.emitToUsers(
        [uid],
        WsEvents.DmConversationUpdated,
        await this.conversationDto(uid, conversationId),
      );
    }
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
        // Отметка о звонке — не сообщение: читать в ней нечего, и счётчик
        // непрочитанных она поднимать не должна
        kind: 'TEXT',
        authorId: { not: userId },
        ...(lastReadMessageId ? { id: { gt: lastReadMessageId } } : {}),
      },
    });
  }

  /** Список диалогов пользователя (свежие сверху), с превью и непрочитанными */
  async listConversations(meId: string): Promise<DmConversationDto[]> {
    const conversations = await this.prisma.dmConversation.findMany({
      where: {
        participants: {
          some: {
            userId: meId,
            // Закрытый диалог возвращается сам: отправка снимает скрытие у всех
            hiddenAt: null,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      include: conversationInclude(meId),
    });

    // Свои настройки диалогов одним запросом: заглушение показывается в списке
    const mine = await this.prisma.dmParticipant.findMany({
      where: { userId: meId, conversationId: { in: conversations.map((c) => c.id) } },
      select: { conversationId: true, mutedUntil: true },
    });
    const mutedBy = new Map(mine.map((p) => [p.conversationId, p.mutedUntil]));

    const list = await Promise.all(
      conversations.map((c) => this.toConversationDto(meId, c, mutedBy.get(c.id))),
    );
    // Закреплённые диалоги — всегда сверху, внутри групп по свежести
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  /** Диалог как DTO (для перехода после open и обновлений) */
  async conversationDto(meId: string, conversationId: string): Promise<DmConversationDto> {
    const conversation = await this.prisma.dmConversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude(meId),
    });
    if (!conversation) throw new NotFoundException('Диалог не найден');
    if (!conversation.participants.some((p) => p.user.id === meId)) {
      throw new ForbiddenException('Нет доступа к этому диалогу');
    }

    /* Заглушение лежит в DmParticipant, а не в readStates, и сюда не
       попадало: каждое обновление диалога — в том числе отметка
       «прочитано» при открытии — присылало mutedUntil: null и снимало
       заглушку у клиента. */
    const mine = await this.prisma.dmParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: meId } },
      select: { mutedUntil: true },
    });
    return this.toConversationDto(meId, conversation, mine?.mutedUntil);
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
    const { conversation, participantIds } = await this.assertParticipant(conversationId, meId);
    // Для 1-на-1 — правило «друг или общий сервер»; в группе достаточно членства
    if (!conversation.isGroup) {
      const peerId = participantIds.find((id) => id !== meId);
      if (peerId) await this.assertCanDm(meId, peerId);
    }

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
    // Новое сообщение возвращает диалог тем, кто его закрыл
    await this.prisma.dmParticipant.updateMany({
      where: { conversationId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });

    const full = await this.prisma.dmMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: DM_INCLUDE,
    });
    const dto = await this.toMessageDto(full);

    // Все участники получают сообщение и обновление превью диалога
    this.ws.emitToUsers(participantIds, WsEvents.DmMessageNew, dto);
    await this.notifyAll(participantIds, conversationId);
    return dto;
  }

  async edit(
    meId: string,
    conversationId: string,
    messageId: string,
    input: EditDmInput,
  ): Promise<DmMessageDto> {
    const { participantIds } = await this.assertParticipant(conversationId, meId);
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== meId)
      throw new ForbiddenException('Редактировать можно только свои сообщения');
    // Отметку о звонке ведёт сервер: чужой текст ей не подсунуть
    if (message.kind !== 'TEXT') throw new BadRequestException('Эту запись нельзя изменить');

    await this.prisma.dmMessage.update({
      where: { id: messageId },
      data: { content: input.content, editedAt: new Date() },
    });
    const full = await this.prisma.dmMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: DM_INCLUDE,
    });
    const dto = await this.toMessageDto(full);
    this.ws.emitToUsers(participantIds, WsEvents.DmMessageEdited, dto);
    return dto;
  }

  async remove(meId: string, conversationId: string, messageId: string): Promise<void> {
    const { participantIds } = await this.assertParticipant(conversationId, meId);
    const message = await this.prisma.dmMessage.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    if (message.authorId !== meId)
      throw new ForbiddenException('Удалять можно только свои сообщения');
    /* Звонок был — значит, был. Позвонивший не должен уметь стирать след
       разговора из чужой переписки. */
    if (message.kind !== 'TEXT') throw new BadRequestException('Эту запись нельзя удалить');

    await this.prisma.dmMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    // Файлы удалённого сообщения не должны вечно занимать квоту автора
    await this.files.removeForMessage({ dmMessageId: messageId });
    this.ws.emitToUsers(participantIds, WsEvents.DmMessageDeleted, {
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
    const { participantIds } = await this.assertParticipant(conversationId, meId);
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

    this.ws.emitToUsers(participantIds, WsEvents.DmReactionAdded, {
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
    const { participantIds } = await this.assertParticipant(conversationId, meId);
    const deleted = await this.prisma.dmReaction.deleteMany({
      where: { dmMessageId: messageId, userId: meId, emoji },
    });
    if (deleted.count === 0) return;

    this.ws.emitToUsers(participantIds, WsEvents.DmReactionRemoved, {
      conversationId,
      messageId,
      emoji,
      userId: meId,
    });
  }

  // ---------- Закреплённые сообщения ----------

  /** Закрепить/открепить сообщение — видно всем участникам */
  async setMessagePinned(
    meId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<DmMessageDto> {
    const { participantIds } = await this.assertParticipant(conversationId, meId);
    const target = await this.findAliveOrThrow(conversationId, messageId);
    if (target.kind !== 'TEXT') throw new BadRequestException('Эту запись нельзя закрепить');

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
    this.ws.emitToUsers(participantIds, WsEvents.DmMessageEdited, dto);
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

  // ---------- Отметки о звонках ----------

  /**
   * Запись о начатом звонке — такая же строка в переписке, как в Discord:
   * сперва «начал звонок», а по завершении она сама превращается в
   * «звонок, 5 минут» или в пропущенный. Отдельного сообщения при этом не
   * появляется: строка одна и та же, она просто обновляется.
   */
  async openCallRecord(conversationId: string, starterId: string): Promise<string> {
    const created = await this.prisma.dmMessage.create({
      data: { conversationId, authorId: starterId, content: '', kind: 'CALL' },
      select: { id: true },
    });
    await this.prisma.dmConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    // Звонок, как и сообщение, возвращает диалог тем, кто его закрыл
    await this.prisma.dmParticipant.updateMany({
      where: { conversationId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
    await this.emitCallRecord(created.id, true);
    return created.id;
  }

  /** Трубку взяли — с этого момента идёт отсчёт длительности */
  async markCallAnswered(messageId: string): Promise<void> {
    const { count } = await this.prisma.dmMessage.updateMany({
      where: { id: messageId, callStartedAt: null },
      data: { callStartedAt: new Date() },
    });
    if (count > 0) await this.emitCallRecord(messageId, false);
  }

  /** Разговор кончился: строка обновляется у всех, кто её уже видит */
  async closeCallRecord(messageId: string): Promise<void> {
    const { count } = await this.prisma.dmMessage.updateMany({
      where: { id: messageId, callEndedAt: null },
      data: { callEndedAt: new Date() },
    });
    if (count > 0) await this.emitCallRecord(messageId, false);
  }

  private async emitCallRecord(messageId: string, isNew: boolean): Promise<void> {
    const full = await this.prisma.dmMessage.findUnique({
      where: { id: messageId },
      include: DM_INCLUDE,
    });
    if (!full) return;

    const dto = await this.toMessageDto(full);
    const participantIds = await this.participantIdsOf(full.conversationId);
    this.ws.emitToUsers(
      participantIds,
      isNew ? WsEvents.DmMessageNew : WsEvents.DmMessageEdited,
      dto,
    );
    await this.notifyAll(participantIds, full.conversationId);
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
