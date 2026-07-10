import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  messagesQuerySchema,
  Permissions,
  sendMessageSchema,
  type MessageDto,
  type MessagesPageDto,
  type MessagesQueryInput,
  type SendMessageInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MessagesService } from './messages.service';

@Controller('channels/:channelId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /** Лимит из раздела 9 PRD: 10 сообщений за 10 секунд */
  @Post()
  @RequirePermissions(Permissions.SEND_MESSAGES)
  @Throttle({ default: { limit: 10, ttl: 10_000 } })
  async send(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<MessageDto> {
    return this.messagesService.send(user.id, channelId, body);
  }

  @Get()
  async history(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: MessagesQueryInput,
  ): Promise<MessagesPageDto> {
    return this.messagesService.history(user.id, channelId, query);
  }
}
