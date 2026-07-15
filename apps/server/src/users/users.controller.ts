import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  updateProfileSchema,
  type MeDto,
  type MemberDto,
  type UpdateProfileInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
  ) {}

  @Get()
  async list(): Promise<MemberDto[]> {
    return this.usersService.listMembers(this.presence.onlineUserIds());
  }

  @Patch('me')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeDto> {
    return this.usersService.updateProfile(user.id, body.username);
  }
}
