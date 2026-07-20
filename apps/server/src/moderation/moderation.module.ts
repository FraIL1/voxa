import { Module } from '@nestjs/common';

import { GuildsModule } from '../guilds/guilds.module';
import { WsModule } from '../ws/ws.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [WsModule, GuildsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
