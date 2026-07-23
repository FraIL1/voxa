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
  ackSchema,
  dmSearchSchema,
  startDmCallSchema,
  editDmSchema,
  messagesQuerySchema,
  openDmSchema,
  sendDmSchema,
  type AckInput,
  type DmConversationDto,
  type DmMessageDto,
  type DmMessagesPageDto,
  type DmSearchInput,
  type EditDmInput,
  type StartDmCallInput,
  type VoiceTokenDto,
  type MessagesQueryInput,
  type OpenDmInput,
  type SendDmInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DmCallsService } from './dm-calls.service';
import { DmService } from './dm.service';

@Controller('dm')
export class DmController {
  constructor(
    private readonly dm: DmService,
    private readonly calls: DmCallsService,
  ) {}

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

  // ---------- Реакции ----------

  @Put('conversations/:id/messages/:messageId/reactions/:emoji')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(204)
  async addReaction(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
  ): Promise<void> {
    await this.dm.addReaction(user.id, id, messageId, decodeURIComponent(emoji));
  }

  @Delete('conversations/:id/messages/:messageId/reactions/:emoji')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(204)
  async removeReaction(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
  ): Promise<void> {
    await this.dm.removeReaction(user.id, id, messageId, decodeURIComponent(emoji));
  }

  // ---------- Закреплённые сообщения ----------

  @Get('conversations/:id/pins')
  listPinned(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DmMessageDto[]> {
    return this.dm.listPinned(user.id, id);
  }

  @Put('conversations/:id/messages/:messageId/pin')
  pinMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<DmMessageDto> {
    return this.dm.setMessagePinned(user.id, id, messageId, true);
  }

  @Delete('conversations/:id/messages/:messageId/pin')
  unpinMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<DmMessageDto> {
    return this.dm.setMessagePinned(user.id, id, messageId, false);
  }

  // ---------- Закрепление диалога и поиск ----------

  @Put('conversations/:id/pin')
  pinConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DmConversationDto> {
    return this.dm.setConversationPinned(user.id, id, true);
  }

  @Delete('conversations/:id/pin')
  unpinConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DmConversationDto> {
    return this.dm.setConversationPinned(user.id, id, false);
  }

  @Get('conversations/:id/search')
  search(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(dmSearchSchema)) query: DmSearchInput,
  ): Promise<DmMessageDto[]> {
    return this.dm.search(user.id, id, query.q);
  }

  // ---------- Звонки 1-на-1 ----------

  @Post('conversations/:id/call')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async startCall(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(startDmCallSchema)) body: StartDmCallInput,
  ): Promise<VoiceTokenDto> {
    const peerId = await this.dm.peerOf(user.id, id);
    return this.calls.start(user.id, peerId, id, body.video);
  }

  @Post('conversations/:id/call/accept')
  async acceptCall(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VoiceTokenDto> {
    await this.dm.peerOf(user.id, id);
    return this.calls.accept(user.id, id);
  }

  @Post('conversations/:id/call/decline')
  @HttpCode(204)
  async declineCall(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.dm.peerOf(user.id, id);
    this.calls.end(id, 'declined');
  }

  @Post('conversations/:id/call/end')
  @HttpCode(204)
  async endCall(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.dm.peerOf(user.id, id);
    this.calls.end(id, 'ended');
  }
}
