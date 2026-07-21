import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VoiceTokenDto } from '@voxa/shared';
import { AccessToken } from 'livekit-server-sdk';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/** Токен живёт долго: переподключения LiveKit не требуют нового */
const TOKEN_TTL = '2h';

@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Комната LiveKit = голосовой канал; имя комнаты — id канала */
  async issueToken(userId: string, channelId: string): Promise<VoiceTokenDto> {
    // Таймаут запрещает и голос (раздел 5.10 PRD)
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timedOutUntil: true, displayName: true },
    });
    if (me?.timedOutUntil && me.timedOutUntil > new Date()) {
      throw new ForbiddenException(`Вы в таймауте до ${me.timedOutUntil.toLocaleString('ru-RU')}`);
    }
    const username = me?.displayName ?? '';

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || !(await this.users.canSeeChannel(userId, channelId))) {
      throw new NotFoundException('Канал не найден');
    }
    if (channel.type !== 'VOICE') {
      throw new BadRequestException('Это не голосовой канал');
    }

    const token = new AccessToken(
      this.config.get('LIVEKIT_API_KEY', { infer: true }),
      this.config.get('LIVEKIT_API_SECRET', { infer: true }),
      { identity: userId, name: username, ttl: TOKEN_TTL },
    );
    token.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: true,
      canSubscribe: true,
    });

    return {
      url: this.config.get('PUBLIC_LIVEKIT_URL', { infer: true }),
      token: await token.toJwt(),
      channelId,
    };
  }
}
