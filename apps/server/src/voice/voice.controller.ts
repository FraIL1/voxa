import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { VoiceChannelStateDto, VoiceTokenDto } from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { VoiceStateService } from './voice-state.service';
import { VoiceService } from './voice.service';

@Controller()
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly voiceStates: VoiceStateService,
  ) {}

  @Post('channels/:channelId/voice-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async token(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ): Promise<VoiceTokenDto> {
    return this.voice.issueToken(user.id, user.username, channelId);
  }

  /** Начальное состояние голосовых каналов (дальше — WS voice.update) */
  @Get('voice/states')
  states(): VoiceChannelStateDto[] {
    return this.voiceStates.all();
  }
}
