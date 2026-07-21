import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateInviteInput, InviteCheckDto, InviteDto } from '@voxa/shared';
import type { Invite, Role, User } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

type InviteWithRelations = Invite & {
  createdBy: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  grantsRole: Pick<Role, 'name'> | null;
};

export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private toDto(invite: InviteWithRelations): InviteDto {
    const now = new Date();
    const isActive =
      invite.revokedAt === null &&
      (invite.expiresAt === null || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.uses < invite.maxUses);

    return {
      id: invite.id,
      code: invite.code,
      url: `${this.config.get('PUBLIC_URL', { infer: true })}/invite/${invite.code}`,
      createdBy: invite.createdBy
        ? {
            id: invite.createdBy.id,
            username: invite.createdBy.username,
            displayName: invite.createdBy.displayName,
            avatarUrl: invite.createdBy.avatarUrl,
          }
        : null,
      grantsRoleName: invite.grantsRole?.name ?? null,
      uses: invite.uses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      revokedAt: invite.revokedAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      isActive,
    };
  }

  private readonly includeRelations = {
    createdBy: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    grantsRole: { select: { name: true } },
  } as const;

  async create(guildId: string, creatorId: string, input: CreateInviteInput): Promise<InviteDto> {
    const invite = await this.prisma.invite.create({
      data: {
        guildId,
        code: generateInviteCode(),
        createdById: creatorId,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresInHours
          ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
          : null,
      },
      include: this.includeRelations,
    });
    return this.toDto(invite);
  }

  async list(guildId: string): Promise<InviteDto[]> {
    const invites = await this.prisma.invite.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      include: this.includeRelations,
    });
    return invites.map((i) => this.toDto(i));
  }

  async revoke(id: string): Promise<void> {
    const result = await this.prisma.invite.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Инвайт не найден или уже отозван');
    }
  }

  /** Публичная проверка кода перед регистрацией (страница инвайта) */
  async check(code: string): Promise<InviteCheckDto> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: { select: { name: true } } },
    });
    if (!invite) return { valid: false, guildName: null };
    const now = new Date();
    const valid =
      invite.revokedAt === null &&
      (invite.expiresAt === null || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.uses < invite.maxUses);
    return { valid, guildName: valid ? invite.guild.name : null };
  }
}
