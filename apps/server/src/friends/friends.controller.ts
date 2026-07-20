import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  sendFriendRequestSchema,
  type BlockedUserDto,
  type FriendDto,
  type FriendRequestDto,
  type SendFriendRequestInput,
  type SendFriendRequestResultDto,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<FriendDto[]> {
    return this.friends.listFriends(user.id);
  }

  @Get('requests')
  listRequests(@CurrentUser() user: RequestUser): Promise<FriendRequestDto[]> {
    return this.friends.listRequests(user.id);
  }

  @Post('requests')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sendRequest(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(sendFriendRequestSchema)) body: SendFriendRequestInput,
  ): Promise<SendFriendRequestResultDto> {
    return this.friends.sendRequest(user.id, body.username);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    await this.friends.acceptRequest(user.id, id);
  }

  @Delete('requests/:id')
  @HttpCode(204)
  async deleteRequest(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    await this.friends.deleteRequest(user.id, id);
  }

  @Get('blocked')
  listBlocked(@CurrentUser() user: RequestUser): Promise<BlockedUserDto[]> {
    return this.friends.listBlocked(user.id);
  }

  @Put('blocked/:userId')
  @HttpCode(204)
  async block(@CurrentUser() user: RequestUser, @Param('userId') userId: string): Promise<void> {
    await this.friends.block(user.id, userId);
  }

  @Delete('blocked/:userId')
  @HttpCode(204)
  async unblock(@CurrentUser() user: RequestUser, @Param('userId') userId: string): Promise<void> {
    await this.friends.unblock(user.id, userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async removeFriend(
    @CurrentUser() user: RequestUser,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.friends.removeFriend(user.id, userId);
  }
}
