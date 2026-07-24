import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  auditQuerySchema,
  createGuildSchema,
  joinGuildRequestSchema,
  transferGuildSchema,
  createRoleSchema,
  Permissions,
  updateGuildSchema,
  updateNicknameSchema,
  updateRoleSchema,
  WsEvents,
  type AuditPageDto,
  type AuditQueryInput,
  type CreateGuildInput,
  type CreateRoleInput,
  type DiscoverGuildDto,
  type GuildDto,
  type GuildJoinRequestDto,
  type JoinAttemptResultDto,
  type JoinGuildRequestInput,
  type TransferGuildInput,
  type MemberDto,
  type RoleDto,
  type UpdateGuildInput,
  type UpdateNicknameInput,
  type UpdateRoleInput,
} from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from '../users/users.service';
import { WsGateway } from '../ws/ws.gateway';
import { GuildsService } from './guilds.service';
import { RolesService } from './roles.service';

@Controller('guilds')
export class GuildsController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly roles: RolesService,
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

  /** Витрина: публичные серверы и серверы по заявке */
  @Get('discover')
  discover(@CurrentUser() user: RequestUser, @Query('q') q?: string): Promise<DiscoverGuildDto[]> {
    return this.guilds.discover(user.id, q);
  }

  @Get(':guildId')
  get(@CurrentUser() user: RequestUser, @Param('guildId') guildId: string): Promise<GuildDto> {
    return this.guilds.guildDto(user.id, guildId);
  }

  @Patch(':guildId')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  update(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(updateGuildSchema)) body: UpdateGuildInput,
  ): Promise<GuildDto> {
    return this.guilds.update(user.id, guildId, body);
  }

  // ---------- Роли ----------

  @Get(':guildId/roles')
  listRoles(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
  ): Promise<RoleDto[]> {
    return this.users.assertMember(guildId, user.id).then(() => this.roles.list(guildId));
  }

  @Post(':guildId/roles')
  @RequirePermissions(Permissions.MANAGE_ROLES)
  createRole(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ): Promise<RoleDto> {
    return this.roles.create(guildId, user.id, body);
  }

  @Patch(':guildId/roles/:roleId')
  @RequirePermissions(Permissions.MANAGE_ROLES)
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ): Promise<RoleDto> {
    return this.roles.update(guildId, user.id, roleId, body);
  }

  @Delete(':guildId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions(Permissions.MANAGE_ROLES)
  async deleteRole(
    @Param('guildId') guildId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.roles.remove(guildId, roleId);
  }

  @Put(':guildId/members/:userId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions(Permissions.MANAGE_ROLES)
  async assignRole(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.roles.assign(guildId, user.id, userId, roleId);
  }

  @Delete(':guildId/members/:userId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions(Permissions.MANAGE_ROLES)
  async unassignRole(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.roles.unassign(guildId, roleId, userId);
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

  /** Вступить из витрины: публичный — сразу, по заявке — заявка */
  @Post(':guildId/join')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  join(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(joinGuildRequestSchema)) body: JoinGuildRequestInput,
  ): Promise<JoinAttemptResultDto> {
    return this.guilds.attemptJoin(user.id, guildId, body.message);
  }

  /** Отозвать свою заявку */
  @Delete(':guildId/join')
  @HttpCode(204)
  async cancelJoin(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
  ): Promise<void> {
    await this.guilds.cancelJoinRequest(user.id, guildId);
  }

  @Get(':guildId/join-requests')
  @RequirePermissions(Permissions.KICK_MEMBERS)
  joinRequests(@Param('guildId') guildId: string): Promise<GuildJoinRequestDto[]> {
    return this.guilds.listJoinRequests(guildId);
  }

  @Post(':guildId/join-requests/:userId')
  @RequirePermissions(Permissions.KICK_MEMBERS)
  @HttpCode(204)
  async approveJoin(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.guilds.approveJoinRequest(guildId, userId);
    this.audit.log(guildId, user.id, 'guild.join.approve', { type: 'user', id: userId });
  }

  @Delete(':guildId/join-requests/:userId')
  @RequirePermissions(Permissions.KICK_MEMBERS)
  @HttpCode(204)
  async rejectJoin(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.guilds.rejectJoinRequest(guildId, userId);
    this.audit.log(guildId, user.id, 'guild.join.reject', { type: 'user', id: userId });
  }

  @Post(':guildId/transfer')
  transfer(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(transferGuildSchema)) body: TransferGuildInput,
  ): Promise<GuildDto> {
    return this.guilds.transferOwnership(user.id, guildId, body.userId);
  }

  @Delete(':guildId')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('guildId') guildId: string): Promise<void> {
    await this.guilds.remove(user.id, guildId);
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
