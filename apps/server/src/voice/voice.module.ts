import { Global, Module } from '@nestjs/common';

import { VoiceStateService } from './voice-state.service';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

/** Global: VoiceStateService нужен WsGateway (ws-модуль без импортов) */
@Global()
@Module({
  controllers: [VoiceController],
  providers: [VoiceService, VoiceStateService],
  exports: [VoiceStateService],
})
export class VoiceModule {}
