import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ackSchema,
  muteChannelSchema,
  type AckInput,
  type MuteChannelInput,
  type ReadStateDto,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReadStatesService } from './read-states.service';

@Controller()
export class ReadStatesController {
  constructor(private readonly readStates: ReadStatesService) {}

  @Get('read-states')
  async list(@CurrentUser() user: RequestUser): Promise<ReadStateDto[]> {
    return this.readStates.listFor(user.id);
  }

  /** Заглушить канал лично для себя */
  @Patch('channels/:channelId/mute')
  async mute(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(muteChannelSchema)) body: MuteChannelInput,
  ): Promise<ReadStateDto> {
    return this.readStates.setMuted(user.id, channelId, body.muted);
  }

  /** Ack шлётся при каждом просмотре канала — лимит щадящий */
  @Post('channels/:channelId/ack')
  @Throttle({ default: { limit: 60, ttl: 10_000 } })
  async ack(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(ackSchema)) body: AckInput,
  ): Promise<ReadStateDto> {
    return this.readStates.ack(user.id, channelId, body.messageId);
  }
}
