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
    return this.voice.issueToken(user.id, channelId);
  }

  /**
   * Начальное состояние голосовых каналов (дальше — WS voice.update).
   *
   * Отдаём только те каналы, которые человек вправе видеть. Без этой проверки
   * любой участник получал состав всех голосовых каналов приложения, включая
   * серверы, на которых он не состоит, и закрытые каналы.
   */
  @Get('voice/states')
  async states(@CurrentUser() user: RequestUser): Promise<VoiceChannelStateDto[]> {
    const all = this.voiceStates.all();
    const visible = await Promise.all(
      all.map((state) => this.voice.canSeeChannel(user.id, state.channelId)),
    );
    return all.filter((_, i) => visible[i]);
  }
}
