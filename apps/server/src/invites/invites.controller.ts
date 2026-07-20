import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createInviteSchema,
  Permissions,
  type CreateInviteInput,
  type InviteCheckDto,
  type InviteDto,
  type JoinGuildResultDto,
} from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GuildsService } from '../guilds/guilds.service';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly guilds: GuildsService,
    private readonly audit: AuditService,
  ) {}

  @Post('guilds/:guildId/invites')
  @RequirePermissions(Permissions.CREATE_INVITES)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<InviteDto> {
    const dto = await this.invitesService.create(guildId, user.id, body);
    this.audit.log(guildId, user.id, 'invite.create', { type: 'invite', id: dto.id });
    return dto;
  }

  @Get('guilds/:guildId/invites')
  @RequirePermissions(Permissions.CREATE_INVITES)
  async list(@Param('guildId') guildId: string): Promise<InviteDto[]> {
    return this.invitesService.list(guildId);
  }

  @Delete('invites/:inviteId')
  @RequirePermissions(Permissions.CREATE_INVITES)
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ): Promise<void> {
    await this.invitesService.revoke(inviteId);
    this.audit.log(null, user.id, 'invite.revoke', { type: 'invite', id: inviteId });
  }

  /** Проверка кода перед регистрацией — без авторизации */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('invites/check/:code')
  async check(@Param('code') code: string): Promise<InviteCheckDto> {
    return this.invitesService.check(code);
  }

  /** Вход на сервер по инвайту для уже вошедшего пользователя */
  @Post('invites/:code/join')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  async join(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
  ): Promise<JoinGuildResultDto> {
    return this.guilds.joinByInvite(user.id, code);
  }
}
