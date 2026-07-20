import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  auditQuerySchema,
  createGuildSchema,
  Permissions,
  type AuditPageDto,
  type AuditQueryInput,
  type CreateGuildInput,
  type GuildDto,
  type MemberDto,
} from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from '../users/users.service';
import { GuildsService } from './guilds.service';

@Controller('guilds')
export class GuildsController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly audit: AuditService,
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
