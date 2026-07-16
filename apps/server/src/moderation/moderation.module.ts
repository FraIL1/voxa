import { Module } from '@nestjs/common';

import { WsModule } from '../ws/ws.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [WsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
