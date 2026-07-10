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
  type InviteDto,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InvitesService } from './invites.service';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  @RequirePermissions(Permissions.CREATE_INVITES)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<InviteDto> {
    return this.invitesService.create(user.id, body);
  }

  @Get()
  @RequirePermissions(Permissions.CREATE_INVITES)
  async list(): Promise<InviteDto[]> {
    return this.invitesService.list();
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CREATE_INVITES)
  @HttpCode(204)
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invitesService.revoke(id);
  }

  /** Проверка кода перед регистрацией — без авторизации */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('check/:code')
  async check(@Param('code') code: string): Promise<{ valid: boolean }> {
    return this.invitesService.check(code);
  }
}
