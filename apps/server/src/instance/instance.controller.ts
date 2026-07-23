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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  instanceBanSchema,
  instanceSettingsSchema,
  type InstanceBanDto,
  type InstanceBanInput,
  type InstanceGuildDto,
  type InstanceOverviewDto,
  type InstanceSettingsDto,
  type InstanceSettingsInput,
  type InstanceUserDto,
  type StorageStatsDto,
} from '@voxa/shared';

import { AuditService } from '../audit/audit.service';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { InstanceOwnerGuard } from '../common/guards/instance-owner.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InstanceService } from './instance.service';

/** Панель владельца приложения — доступна только ему */
@Controller('instance')
@UseGuards(InstanceOwnerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class InstanceController {
  constructor(
    private readonly instance: InstanceService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  overview(): Promise<InstanceOverviewDto> {
    return this.instance.overview();
  }

  // ---------- Пользователи ----------

  @Get('users')
  users(@Query('q') q?: string): Promise<InstanceUserDto[]> {
    return this.instance.listUsers(q);
  }

  @Post('users/:userId/ban')
  @HttpCode(204)
  async ban(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(instanceBanSchema)) body: InstanceBanInput,
  ): Promise<void> {
    await this.instance.banUser(user.id, userId, body.reason);
    this.audit.log(
      null,
      user.id,
      'instance.user.ban',
      { type: 'user', id: userId },
      body.reason ? { reason: body.reason } : undefined,
    );
  }

  @Delete('users/:userId/ban')
  @HttpCode(204)
  async unban(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.instance.unbanUser(userId);
    this.audit.log(null, user.id, 'instance.user.unban', { type: 'user', id: userId });
  }

  @Post('users/:userId/logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.instance.revokeSessions(userId);
    this.audit.log(null, user.id, 'instance.user.logout', { type: 'user', id: userId });
  }

  @Get('bans')
  bans(): Promise<InstanceBanDto[]> {
    return this.instance.listBans();
  }

  // ---------- Серверы ----------

  @Get('guilds')
  guilds(): Promise<InstanceGuildDto[]> {
    return this.instance.listGuilds();
  }

  @Delete('guilds/:guildId')
  @HttpCode(204)
  async deleteGuild(
    @CurrentUser() user: RequestUser,
    @Param('guildId', ParseUUIDPipe) guildId: string,
  ): Promise<void> {
    await this.instance.deleteGuild(guildId);
    this.audit.log(null, user.id, 'instance.guild.delete', { type: 'guild', id: guildId });
  }

  // ---------- Доступ и лимиты ----------

  @Get('settings')
  settings(): Promise<InstanceSettingsDto> {
    return this.instance.settings();
  }

  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(instanceSettingsSchema)) body: InstanceSettingsInput,
  ): Promise<InstanceSettingsDto> {
    const settings = await this.instance.updateSettings(body);
    this.audit.log(null, user.id, 'instance.settings.update', undefined, { ...body });
    return settings;
  }

  // ---------- Хранилище ----------

  @Get('storage')
  storage(): Promise<StorageStatsDto> {
    return this.instance.storage();
  }

  @Post('storage/cleanup')
  async cleanup(@CurrentUser() user: RequestUser): Promise<{ removed: number }> {
    const result = await this.instance.cleanupOrphans();
    this.audit.log(null, user.id, 'instance.storage.cleanup', undefined, result);
    return result;
  }
}
