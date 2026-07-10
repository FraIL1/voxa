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
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  editMessageSchema,
  messagesQuerySchema,
  Permissions,
  reactionEmojiSchema,
  sendMessageSchema,
  type EditMessageInput,
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

  @Patch(':messageId')
  @Throttle({ default: { limit: 15, ttl: 10_000 } })
  async edit(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(editMessageSchema)) body: EditMessageInput,
  ): Promise<MessageDto> {
    return this.messagesService.edit(user.id, channelId, messageId, body);
  }

  @Delete(':messageId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.messagesService.remove(user.id, channelId, messageId);
  }

  @Put(':messageId/reactions/:emoji')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  async addReaction(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji', new ZodValidationPipe(reactionEmojiSchema)) emoji: string,
  ): Promise<void> {
    await this.messagesService.addReaction(user.id, channelId, messageId, emoji);
  }

  @Delete(':messageId/reactions/:emoji')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  async removeReaction(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji', new ZodValidationPipe(reactionEmojiSchema)) emoji: string,
  ): Promise<void> {
    await this.messagesService.removeReaction(user.id, channelId, messageId, emoji);
  }
}
