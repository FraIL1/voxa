import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const REFRESH_TTL_DAYS = 30;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Access — короткоживущий JWT (15 мин). Refresh — непрозрачный случайный
 * токен в httpOnly-cookie; в БД хранится только его HMAC. Ротация: каждый
 * refresh гасит старый токен и выдаёт новый в том же «семействе». Попытка
 * использовать уже погашенный токен = признак кражи → отзывается всё семейство.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.config.get('JWT_REFRESH_SECRET', { infer: true }))
      .update(token)
      .digest('hex');
  }

  private async signAccessToken(
    userId: string,
    username: string,
    sessionId: string,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, username, sid: sessionId });
  }

  /** Новая сессия (регистрация или вход) */
  async issueSession(userId: string, username: string, meta: ClientMeta): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(refreshToken),
        family: randomUUID(),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken: await this.signAccessToken(userId, username, session.id),
      refreshToken,
      refreshExpiresAt,
      sessionId: session.id,
    };
  }

  /** Ротация refresh-токена с детекцией повторного использования */
  async rotate(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens & { userId: string }> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Сессия не найдена, войдите заново');
    }
    if (session.revokedAt) {
      // Свежий повтор (< 10 с) — почти наверняка гонка двух вкладок одного
      // браузера, отправивших один cookie одновременно: не кража, семью не гасим.
      const reuseAgeMs = Date.now() - session.revokedAt.getTime();
      if (reuseAgeMs > 10_000) {
        // Токен обменяли давно — кто-то использует украденную копию.
        // Гасим всё семейство: и вора, и легитимного клиента (перелогин).
        await this.prisma.refreshSession.updateMany({
          where: { family: session.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Обнаружено повторное использование токена, войдите заново');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Сессия истекла, войдите заново');
    }

    const newRefreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [, newSession] = await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: this.hashRefreshToken(newRefreshToken),
          family: session.family,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 255),
          expiresAt: refreshExpiresAt,
        },
      }),
    ]);

    return {
      accessToken: await this.signAccessToken(
        session.user.id,
        session.user.username,
        newSession.id,
      ),
      refreshToken: newRefreshToken,
      refreshExpiresAt,
      sessionId: newSession.id,
      userId: session.userId,
    };
  }

  /** Отзыв сессии по refresh-токену (logout) */
  async revokeByToken(refreshToken: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Отзыв всех сессий пользователя, кроме (опционально) текущей */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Чистка протухших сессий (вызывается при входе, чтобы таблица не росла) */
  async pruneExpired(userId: string): Promise<void> {
    await this.prisma.refreshSession.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
