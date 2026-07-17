import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WsEvents, type BanDto } from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LiveKitAdminService } from '../voice/livekit-admin.service';
import { VoiceStateService } from '../voice/voice-state.service';
import { WsGateway } from '../ws/ws.gateway';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ws: WsGateway,
    private readonly voiceStates: VoiceStateService,
    private readonly livekit: LiveKitAdminService,
  ) {}

  /** Выбросить из голосового канала на всех уровнях (состояние + LiveKit) */
  private async removeFromVoice(userId: string): Promise<void> {
    const channelId = this.voiceStates.drop(userId);
    if (!channelId) return;
    this.ws.broadcastVoiceState(channelId);
    await this.livekit.removeFromRoom(channelId, userId);
  }

  /** Владельца нельзя кикать/банить/таймаутить; себя — тоже */
  private async assertModeratable(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) {
      throw new BadRequestException('Нельзя применить действие к самому себе');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { roles: { include: { role: { select: { isOwnerRole: true } } } } },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');
    if (target.roles.some((r) => r.role.isOwnerRole)) {
      throw new ForbiddenException('Действие нельзя применить к Владельцу');
    }
  }

  /** Завершение всех сессий: refresh-токены отзываются, сокеты отключаются */
  private async terminateSessions(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.ws.forceLogout(userId, reason);
  }

  /** Кик: принудительный выход со всех устройств (вход снова — можно) */
  async kick(actorId: string, targetId: string, reason?: string): Promise<void> {
    await this.assertModeratable(actorId, targetId);
    await this.removeFromVoice(targetId);
    await this.terminateSessions(
      targetId,
      reason ? `Вы были кикнуты: ${reason}` : 'Вы были кикнуты',
    );
    this.audit.log(
      actorId,
      'user.kick',
      { type: 'user', id: targetId },
      reason ? { reason } : undefined,
    );
  }

  /** Бан: кик + запрет входа до разбана */
  async ban(actorId: string, targetId: string, reason?: string): Promise<void> {
    await this.assertModeratable(actorId, targetId);

    const existing = await this.prisma.ban.findUnique({ where: { userId: targetId } });
    if (existing) throw new BadRequestException('Пользователь уже забанен');

    await this.prisma.ban.create({
      data: { userId: targetId, reason: reason ?? null, bannedById: actorId },
    });

    await this.removeFromVoice(targetId);
    await this.terminateSessions(
      targetId,
      reason ? `Вы заблокированы: ${reason}` : 'Вы заблокированы',
    );
    this.audit.log(
      actorId,
      'user.ban',
      { type: 'user', id: targetId },
      reason ? { reason } : undefined,
    );
  }

  async unban(actorId: string, targetId: string): Promise<void> {
    const result = await this.prisma.ban.deleteMany({ where: { userId: targetId } });
    if (result.count === 0) throw new NotFoundException('Пользователь не забанен');
    this.audit.log(actorId, 'user.unban', { type: 'user', id: targetId });
  }

  async listBans(): Promise<BanDto[]> {
    const bans = await this.prisma.ban.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true } },
        bannedBy: { select: { username: true } },
      },
    });
    return bans.map((ban) => ({
      userId: ban.userId,
      username: ban.user.username,
      reason: ban.reason,
      bannedByUsername: ban.bannedBy?.username ?? null,
      createdAt: ban.createdAt.toISOString(),
    }));
  }

  /** Таймаут: не может писать и говорить до истечения срока */
  async timeout(
    actorId: string,
    targetId: string,
    minutes: number,
    reason?: string,
  ): Promise<{ until: string }> {
    await this.assertModeratable(actorId, targetId);

    const until = new Date(Date.now() + minutes * 60_000);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { timedOutUntil: until },
    });

    // Если человек в голосе — не выкидываем, а принудительно мутим:
    // на уровне SFU (canPublish=false) и в видимом состоянии канала
    const voiceChannelId = this.voiceStates.forceMute(targetId);
    if (voiceChannelId) {
      this.ws.broadcastVoiceState(voiceChannelId);
      await this.livekit.setCanPublish(voiceChannelId, targetId, false);
    }

    this.ws.emitToUsers([targetId], WsEvents.MeTimedOut, { until: until.toISOString() });
    this.audit.log(
      actorId,
      'user.timeout',
      { type: 'user', id: targetId },
      { minutes, ...(reason ? { reason } : {}) },
    );
    return { until: until.toISOString() };
  }

  async clearTimeout(actorId: string, targetId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { timedOutUntil: null },
    });

    // Возвращаем право говорить (размутится человек сам)
    const voiceChannelId = this.voiceStates.channelOf(targetId);
    if (voiceChannelId) {
      await this.livekit.setCanPublish(voiceChannelId, targetId, true);
    }

    this.ws.emitToUsers([targetId], WsEvents.MeTimedOut, { until: null });
    this.audit.log(actorId, 'user.timeout.clear', { type: 'user', id: targetId });
  }
}
