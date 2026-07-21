import { Body, Controller, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { updateProfileSchema, type MeDto, type UpdateProfileInput } from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WsGateway } from '../ws/ws.gateway';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ws: WsGateway,
  ) {}

  @Patch('me')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeDto> {
    const me = await this.usersService.updateProfile(user.id, body.displayName);
    await this.ws.handleUserRenamed(me);
    return me;
  }
}
