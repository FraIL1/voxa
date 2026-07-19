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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ackSchema,
  editDmSchema,
  messagesQuerySchema,
  openDmSchema,
  sendDmSchema,
  type AckInput,
  type DmConversationDto,
  type DmMessageDto,
  type DmMessagesPageDto,
  type EditDmInput,
  type MessagesQueryInput,
  type OpenDmInput,
  type SendDmInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DmService } from './dm.service';

@Controller('dm')
export class DmController {
  constructor(private readonly dm: DmService) {}

  @Get('conversations')
  async list(@CurrentUser() user: RequestUser): Promise<DmConversationDto[]> {
    return this.dm.listConversations(user.id);
  }

  /** Открыть/создать диалог с пользователем */
  @Post('conversations')
  async open(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(openDmSchema)) body: OpenDmInput,
  ): Promise<{ id: string }> {
    return this.dm.openConversation(user.id, body.userId);
  }

  @Get('conversations/:id/messages')
  async history(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: MessagesQueryInput,
  ): Promise<DmMessagesPageDto> {
    return this.dm.history(user.id, id, query);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 15, ttl: 10_000 } })
  async send(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendDmSchema)) body: SendDmInput,
  ): Promise<DmMessageDto> {
    return this.dm.send(user.id, id, body);
  }

  @Patch('conversations/:id/messages/:messageId')
  @Throttle({ default: { limit: 15, ttl: 10_000 } })
  async edit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(editDmSchema)) body: EditDmInput,
  ): Promise<DmMessageDto> {
    return this.dm.edit(user.id, id, messageId, body);
  }

  @Delete('conversations/:id/messages/:messageId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.dm.remove(user.id, id, messageId);
  }

  @Post('conversations/:id/ack')
  @Throttle({ default: { limit: 60, ttl: 10_000 } })
  @HttpCode(204)
  async ack(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ackSchema)) body: AckInput,
  ): Promise<void> {
    await this.dm.ack(user.id, id, body.messageId);
  }
}
