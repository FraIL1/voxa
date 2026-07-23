import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateRegistrationInviteInput,
  RegistrationInviteCheckDto,
  RegistrationInviteDto,
} from '@voxa/shared';
import type { RegistrationInvite } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export function generateRegistrationCode(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * Коды регистрации в приложении. В отличие от серверных инвайтов, ими
 * распоряжается только владелец приложения — они открывают доступ ко
 * всему приложению, а не к отдельному серверу.
 */
@Injectable()
export class RegistrationInvitesService {
  private readonly logger = new Logger(RegistrationInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private isActive(invite: RegistrationInvite, now = new Date()): boolean {
    return (
      invite.revokedAt === null &&
      (invite.expiresAt === null || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.uses < invite.maxUses)
    );
  }

  private toDto(invite: RegistrationInvite): RegistrationInviteDto {
    return {
      id: invite.id,
      code: invite.code,
      url: `${this.config.get('PUBLIC_URL', { infer: true })}/register/${invite.code}`,
      uses: invite.uses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      isActive: this.isActive(invite),
    };
  }

  async create(
    creatorId: string,
    input: CreateRegistrationInviteInput,
  ): Promise<RegistrationInviteDto> {
    const invite = await this.prisma.registrationInvite.create({
      data: {
        code: generateRegistrationCode(),
        createdById: creatorId,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresInHours
          ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
          : null,
      },
    });
    return this.toDto(invite);
  }

  async list(): Promise<RegistrationInviteDto[]> {
    const invites = await this.prisma.registrationInvite.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => this.toDto(i));
  }

  async revoke(id: string): Promise<void> {
    const result = await this.prisma.registrationInvite.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Код не найден или уже отозван');
  }

  /** Публичная проверка кода перед регистрацией */
  async check(code: string): Promise<RegistrationInviteCheckDto> {
    const invite = await this.prisma.registrationInvite.findUnique({ where: { code } });
    return { valid: invite !== null && this.isActive(invite) };
  }

  /**
   * Пока в приложении нет владельца — держим одноразовый bootstrap-код
   * (печатается в лог), чтобы первый зарегистрировавшийся стал владельцем.
   */
  async ensureBootstrap(): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { isInstanceOwner: true },
      select: { id: true },
    });
    if (owner) return;

    let invite = await this.prisma.registrationInvite.findFirst({
      where: { revokedAt: null, uses: 0 },
    });
    invite ??= await this.prisma.registrationInvite.create({
      data: { code: generateRegistrationCode(), maxUses: 1 },
    });

    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    this.logger.warn('==========================================================');
    this.logger.warn('Владельца приложения ещё нет. Одноразовый код регистрации:');
    this.logger.warn(`  Код: ${invite.code}`);
    this.logger.warn(`  Ссылка: ${publicUrl}/register/${invite.code}`);
    this.logger.warn('Первый зарегистрировавшийся по нему станет владельцем приложения.');
    this.logger.warn('==========================================================');
  }
}
