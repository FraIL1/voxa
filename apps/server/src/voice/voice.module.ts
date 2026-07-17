import { Global, Module } from '@nestjs/common';

import { LiveKitAdminService } from './livekit-admin.service';
import { VoiceStateService } from './voice-state.service';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

/** Global: VoiceStateService нужен WsGateway, LiveKitAdmin — модерации */
@Global()
@Module({
  controllers: [VoiceController],
  providers: [VoiceService, VoiceStateService, LiveKitAdminService],
  exports: [VoiceStateService, LiveKitAdminService],
})
export class VoiceModule {}
