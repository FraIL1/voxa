import { Module } from '@nestjs/common';

import { WsModule } from '../ws/ws.module';
import { ReadStatesController } from './read-states.controller';
import { ReadStatesService } from './read-states.service';

@Module({
  imports: [WsModule],
  controllers: [ReadStatesController],
  providers: [ReadStatesService],
  exports: [ReadStatesService],
})
export class ReadStatesModule {}
