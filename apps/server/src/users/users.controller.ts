import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  updateProfileSchema,
  type MeDto,
  type UpdateProfileInput,
  type UserProfileDto,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { WsGateway } from '../ws/ws.gateway';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
    private readonly ws: WsGateway,
  ) {}

  @Patch('me')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeDto> {
    const me = await this.usersService.updateProfile(user.id, body);
    await this.ws.handleUserRenamed(me);
    return me;
  }

  /** Карточка профиля другого участника */
  @Get(':userId/profile')
  getProfile(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserProfileDto> {
    return this.usersService.getProfile(user.id, userId, this.presence.onlineUserIds());
  }
}
