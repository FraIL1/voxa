import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WsEvents, type BanDto } from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { GuildsService } from '../guilds/guilds.service';
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
    private readonly guilds: GuildsService,
    private readonly voiceStates: VoiceStateService,
    private readonly livekit: LiveKitAdminService,
  ) {}

  /** Выбросить из голосового канала ЭТОГО сервера (состояние + LiveKit) */
  private async removeFromVoice(guildId: string, userId: string): Promise<void> {
    const channelId = this.voiceStates.channelOf(userId);
    if (!channelId) return;
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (channel?.guildId !== guildId) return;

    this.voiceStates.drop(userId);
    this.ws.broadcastVoiceState(channelId);
    await this.livekit.removeFromRoom(channelId, userId);
  }

  /** Владельца сервера нельзя кикать/банить/таймаутить; себя — тоже */
  private async assertModeratable(
    guildId: string,
    actorId: string,
    targetId: string,
  ): Promise<void> {
    if (actorId === targetId) {
      throw new BadRequestException('Нельзя применить действие к самому себе');
    }
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (!guild) throw new NotFoundException('Сервер не найден');
    if (guild.ownerId === targetId) {
      throw new ForbiddenException('Действие нельзя применить к владельцу сервера');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');
  }

  /** Кик: удаление с сервера (аккаунт и другие серверы не трогаем) */
  async kick(guildId: string, actorId: string, targetId: string, reason?: string): Promise<void> {
    await this.assertModeratable(guildId, actorId, targetId);
    await this.removeFromVoice(guildId, targetId);
    await this.guilds.removeMember(guildId, targetId);

    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.ws.emitToUsers([targetId], WsEvents.MeGuildsChanged, {});
    this.audit.log(
      guildId,
      actorId,
      'user.kick',
      { type: 'user', id: targetId },
      reason ? { reason } : undefined,
    );
  }

  /** Бан: кик + запрет вступления по инвайтам до разбана */
  async ban(guildId: string, actorId: string, targetId: string, reason?: string): Promise<void> {
    await this.assertModeratable(guildId, actorId, targetId);

    const existing = await this.prisma.ban.findUnique({
      where: { guildId_userId: { guildId, userId: targetId } },
    });
    if (existing) throw new BadRequestException('Пользователь уже забанен');

    await this.prisma.ban.create({
      data: { guildId, userId: targetId, reason: reason ?? null, bannedById: actorId },
    });

    await this.removeFromVoice(guildId, targetId);
    // Мог уже не быть участником (бан из списка банов после кика) — это ок
    await this.guilds.removeMember(guildId, targetId).catch(() => undefined);

    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.ws.emitToUsers([targetId], WsEvents.MeGuildsChanged, {});
    this.audit.log(
      guildId,
      actorId,
      'user.ban',
      { type: 'user', id: targetId },
      reason ? { reason } : undefined,
    );
  }

  async unban(guildId: string, actorId: string, targetId: string): Promise<void> {
    const result = await this.prisma.ban.deleteMany({ where: { guildId, userId: targetId } });
    if (result.count === 0) throw new NotFoundException('Пользователь не забанен');
    this.audit.log(guildId, actorId, 'user.unban', { type: 'user', id: targetId });
  }

  async listBans(guildId: string): Promise<BanDto[]> {
    const bans = await this.prisma.ban.findMany({
      where: { guildId },
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

  /** Таймаут: не может писать и говорить до истечения срока (пока общий) */
  async timeout(
    guildId: string,
    actorId: string,
    targetId: string,
    minutes: number,
    reason?: string,
  ): Promise<{ until: string }> {
    await this.assertModeratable(guildId, actorId, targetId);

    const until = new Date(Date.now() + minutes * 60_000);
    await this.prisma.guildMember.update({
      where: { guildId_userId: { guildId, userId: targetId } },
      data: { timedOutUntil: until },
    });

    // Если человек в голосе — не выкидываем, а принудительно мутим:
    // на уровне SFU (canPublish=false) и в видимом состоянии канала
    const voiceChannelId = this.voiceStates.forceMute(targetId);
    if (voiceChannelId) {
      this.ws.broadcastVoiceState(voiceChannelId);
      await this.livekit.setCanPublish(voiceChannelId, targetId, false);
    }

    this.ws.emitToUsers([targetId], WsEvents.MeTimedOut, {
      guildId,
      until: until.toISOString(),
    });
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.audit.log(
      guildId,
      actorId,
      'user.timeout',
      { type: 'user', id: targetId },
      { minutes, ...(reason ? { reason } : {}) },
    );
    return { until: until.toISOString() };
  }

  async clearTimeout(guildId: string, actorId: string, targetId: string): Promise<void> {
    await this.prisma.guildMember.update({
      where: { guildId_userId: { guildId, userId: targetId } },
      data: { timedOutUntil: null },
    });

    // Возвращаем право говорить (размутится человек сам)
    const voiceChannelId = this.voiceStates.channelOf(targetId);
    if (voiceChannelId) {
      await this.livekit.setCanPublish(voiceChannelId, targetId, true);
    }

    this.ws.emitToUsers([targetId], WsEvents.MeTimedOut, { guildId, until: null });
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
    this.audit.log(guildId, actorId, 'user.timeout.clear', { type: 'user', id: targetId });
  }
}
