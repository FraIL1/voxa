import { Controller, Get } from '@nestjs/common';
import type { MemberDto } from '@voxa/shared';

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
}
