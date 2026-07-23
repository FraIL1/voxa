import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginInput, MeDto, RegisterInput } from '@voxa/shared';
import * as argon2 from 'argon2';

import { InstanceService } from '../instance/instance.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { HibpService } from './hibp.service';
import { IssuedTokens, TokensService } from './tokens.service';

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  tokens: IssuedTokens;
  user: MeDto;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 МиБ — рекомендация OWASP
  timeCost: 2,
  parallelism: 1,
};

/** После скольких подряд неудач включается экспоненциальная задержка */
const BACKOFF_THRESHOLD = 5;
/** Окно, в котором считаются неудачные попытки */
const BACKOFF_WINDOW_MS = 15 * 60 * 1000;
/** Максимальная задержка между попытками */
const BACKOFF_MAX_SECONDS = 300;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly hibp: HibpService,
    private readonly instance: InstanceService,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta): Promise<AuthResult> {
    // Первый аккаунт создаётся всегда — он и станет владельцем приложения
    const isFirstUser = (await this.prisma.user.count()) === 0;
    if (!isFirstUser && !(await this.instance.registrationOpen())) {
      throw new ForbiddenException('Регистрация в приложении закрыта');
    }
    if (await this.hibp.isPwned(input.password)) {
      throw new BadRequestException('Этот пароль встречается в утёкших базах — выберите другой');
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      // Код регистрации в приложении: атомарно занимаем одно использование
      const claimed = await tx.registrationInvite.updateMany({
        where: {
          code: input.inviteCode,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('Код регистрации недействителен, истёк или отозван');
      }

      const invite = await tx.registrationInvite.findUniqueOrThrow({
        where: { code: input.inviteCode },
      });
      if (invite.maxUses !== null && invite.uses > invite.maxUses) {
        throw new BadRequestException('Лимит использований кода исчерпан');
      }

      const existing = await tx.user.findUnique({
        where: { usernameLower: input.username.toLowerCase() },
      });
      if (existing) {
        throw new ConflictException('Это имя пользователя уже занято');
      }

      const created = await tx.user.create({
        data: {
          username: input.username,
          usernameLower: input.username.toLowerCase(),
          displayName: input.username, // по умолчанию совпадает с логином
          passwordHash,
          isInstanceOwner: isFirstUser,
        },
      });

      // Первый пользователь — владелец приложения: становится владельцем и
      // членом стартового сервера «Voxa». Остальные регистрируются «пустыми»
      // и дальше создают свои серверы либо вступают по серверным инвайтам.
      if (isFirstUser) {
        const seedGuildId = (await tx.appMeta.findUnique({ where: { key: 'seed:v1' } }))?.value;
        const guild = seedGuildId
          ? await tx.guild.findUnique({
              where: { id: seedGuildId },
              select: { id: true, ownerId: true },
            })
          : null;
        if (guild) {
          await tx.guildMember.create({ data: { guildId: guild.id, userId: created.id } });
          const [ownerRole, defaultRole] = await Promise.all([
            tx.role.findFirst({ where: { guildId: guild.id, isOwnerRole: true } }),
            tx.role.findFirst({ where: { guildId: guild.id, isDefault: true } }),
          ]);
          const roleIds = new Set<string>();
          if (defaultRole) roleIds.add(defaultRole.id);
          if (ownerRole) roleIds.add(ownerRole.id);
          if (roleIds.size > 0) {
            await tx.userRole.createMany({
              data: [...roleIds].map((roleId) => ({ userId: created.id, roleId })),
            });
          }
          if (guild.ownerId === null) {
            await tx.guild.update({ where: { id: guild.id }, data: { ownerId: created.id } });
          }
        }
      }

      // Исчерпанный код регистрации гасим сразу
      if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
        await tx.registrationInvite.update({ where: { id: invite.id }, data: { revokedAt: now } });
      }

      return created;
    });

    const tokens = await this.tokens.issueSession(user.id, user.username, meta);
    return { tokens, user: await this.users.getMe(user.id) };
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
    const usernameLower = input.username.toLowerCase();
    await this.assertBackoff(usernameLower);

    const user = await this.prisma.user.findUnique({ where: { usernameLower } });
    const passwordOk = user !== null && (await argon2.verify(user.passwordHash, input.password));

    await this.prisma.loginAttempt.create({
      data: { username: usernameLower, ip: meta.ip ?? 'unknown', success: passwordOk },
    });

    if (!user || !passwordOk) {
      throw new UnauthorizedException('Неверное имя пользователя или пароль');
    }

    // Глобальный бан закрывает вход в приложение целиком
    const banned = await this.instance.banOf(user.id);
    if (banned) {
      throw new ForbiddenException(
        banned.reason ? `Доступ закрыт: ${banned.reason}` : 'Доступ к приложению закрыт',
      );
    }

    await this.tokens.pruneExpired(user.id);
    const tokens = await this.tokens.issueSession(user.id, user.username, meta);
    return { tokens, user: await this.users.getMe(user.id) };
  }

  /** Экспоненциальная задержка после 5 неудач (раздел 5.1 PRD) */
  private async assertBackoff(usernameLower: string): Promise<void> {
    const windowStart = new Date(Date.now() - BACKOFF_WINDOW_MS);

    const lastSuccess = await this.prisma.loginAttempt.findFirst({
      where: { username: usernameLower, success: true, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const since = lastSuccess ? lastSuccess.createdAt : windowStart;

    const failures = await this.prisma.loginAttempt.count({
      where: { username: usernameLower, success: false, createdAt: { gt: since } },
    });
    if (failures < BACKOFF_THRESHOLD) return;

    const lastAttempt = await this.prisma.loginAttempt.findFirst({
      where: { username: usernameLower, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!lastAttempt) return;

    const delaySeconds = Math.min(2 ** (failures - BACKOFF_THRESHOLD + 1), BACKOFF_MAX_SECONDS);
    const retryAt = lastAttempt.createdAt.getTime() + delaySeconds * 1000;
    const waitMs = retryAt - Date.now();
    if (waitMs > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Слишком много неудачных попыток входа. Подождите ${Math.ceil(waitMs / 1000)} с`,
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedException('Текущий пароль неверен');
    }
    if (await this.hibp.isPwned(newPassword)) {
      throw new BadRequestException('Этот пароль встречается в утёкших базах — выберите другой');
    }

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Завершаем все прочие сессии (раздел 5.1 PRD), текущую оставляем
    await this.tokens.revokeAll(userId, sessionId);
  }
}
