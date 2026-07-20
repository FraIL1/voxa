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
  moderationReasonSchema,
  Permissions,
  timeoutSchema,
  type BanDto,
  type ModerationReasonInput,
  type TimeoutInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ModerationService } from './moderation.service';

@Controller('guilds/:guildId')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('members/:userId/kick')
  @HttpCode(204)
  @RequirePermissions(Permissions.KICK_MEMBERS)
  async kick(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
    @Body(new ZodValidationPipe(moderationReasonSchema)) body: ModerationReasonInput,
  ): Promise<void> {
    await this.moderation.kick(guildId, user.id, targetId, body.reason);
  }

  @Post('members/:userId/ban')
  @HttpCode(204)
  @RequirePermissions(Permissions.BAN_MEMBERS)
  async ban(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
    @Body(new ZodValidationPipe(moderationReasonSchema)) body: ModerationReasonInput,
  ): Promise<void> {
    await this.moderation.ban(guildId, user.id, targetId, body.reason);
  }

  @Get('bans')
  @RequirePermissions(Permissions.BAN_MEMBERS)
  async bans(@Param('guildId') guildId: string): Promise<BanDto[]> {
    return this.moderation.listBans(guildId);
  }

  @Delete('bans/:userId')
  @HttpCode(204)
  @RequirePermissions(Permissions.BAN_MEMBERS)
  async unban(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ): Promise<void> {
    await this.moderation.unban(guildId, user.id, targetId);
  }

  @Post('members/:userId/timeout')
  @RequirePermissions(Permissions.MUTE_MEMBERS)
  async timeout(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
    @Body(new ZodValidationPipe(timeoutSchema)) body: TimeoutInput,
  ): Promise<{ until: string }> {
    return this.moderation.timeout(guildId, user.id, targetId, body.minutes, body.reason);
  }

  @Delete('members/:userId/timeout')
  @HttpCode(204)
  @RequirePermissions(Permissions.MUTE_MEMBERS)
  async clearTimeout(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ): Promise<void> {
    await this.moderation.clearTimeout(guildId, user.id, targetId);
  }
}
