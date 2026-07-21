import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  auditQuerySchema,
  createGuildSchema,
  Permissions,
  updateNicknameSchema,
  WsEvents,
  type AuditPageDto,
  type AuditQueryInput,
  type CreateGuildInput,
  type GuildDto,
  type MemberDto,
  type UpdateNicknameInput,
} from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';
import { GuildsService } from './guilds.service';

@Controller('guilds')
export class GuildsController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly audit: AuditService,
    private readonly ws: WsGateway,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<GuildDto[]> {
    return this.guilds.myGuilds(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createGuildSchema)) body: CreateGuildInput,
  ): Promise<GuildDto> {
    return this.guilds.create(user.id, body);
  }

  @Get(':guildId')
  get(@CurrentUser() user: RequestUser, @Param('guildId') guildId: string): Promise<GuildDto> {
    return this.guilds.guildDto(user.id, guildId);
  }

  @Get(':guildId/members')
  async members(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
  ): Promise<MemberDto[]> {
    await this.users.assertMember(guildId, user.id);
    return this.users.listMembers(guildId, this.presence.onlineUserIds());
  }

  @Patch(':guildId/members/me/nickname')
  @HttpCode(204)
  async setNickname(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(updateNicknameSchema)) body: UpdateNicknameInput,
  ): Promise<void> {
    await this.users.setNickname(guildId, user.id, body.nickname);
    this.ws.emitToGuild(guildId, WsEvents.GuildMembersChanged, { guildId });
  }

  @Post(':guildId/leave')
  @HttpCode(204)
  async leave(@CurrentUser() user: RequestUser, @Param('guildId') guildId: string): Promise<void> {
    await this.guilds.leave(user.id, guildId);
  }

  @Get(':guildId/audit')
  @RequirePermissions(Permissions.ADMINISTRATOR)
  auditLog(
    @Param('guildId') guildId: string,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ): Promise<AuditPageDto> {
    return this.audit.list(guildId, query);
  }
}
