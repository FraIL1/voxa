import { Injectable } from '@nestjs/common';
import type {
  CreateSupportTicketInput,
  SupportTicketDto,
  UpdateSupportTicketInput,
} from '@voxa/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const includeAuthor = {
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.SupportTicketInclude;

type TicketWithAuthor = Prisma.SupportTicketGetPayload<{ include: typeof includeAuthor }>;

function toDto(ticket: TicketWithAuthor): SupportTicketDto {
  return {
    id: ticket.id,
    kind: ticket.kind,
    status: ticket.status,
    message: ticket.message,
    appVersion: ticket.appVersion,
    platform: ticket.platform,
    author: ticket.author,
    createdAt: ticket.createdAt.toISOString(),
  };
}

/**
 * Обращения в поддержку. Пишет любой вошедший, читает только владелец
 * приложения — это канал «нашёл поломку» к тому, кто её починит.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, input: CreateSupportTicketInput): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        authorId,
        kind: input.kind,
        message: input.message,
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
      },
      include: includeAuthor,
    });
    return toDto(ticket);
  }

  /** Новые сверху: владелец разбирает список с начала */
  async list(): Promise<SupportTicketDto[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: includeAuthor,
    });
    return tickets.map(toDto);
  }

  async setStatus(id: string, input: UpdateSupportTicketInput): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: input.status },
      include: includeAuthor,
    });
    return toDto(ticket);
  }

  /** Сколько необработанных — для точки на разделе в панели владельца */
  countNew(): Promise<number> {
    return this.prisma.supportTicket.count({ where: { status: 'NEW' } });
  }
}
