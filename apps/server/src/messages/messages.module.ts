import { Module } from '@nestjs/common';

import { ReadStatesModule } from '../read-states/read-states.module';
import { WsModule } from '../ws/ws.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [WsModule, ReadStatesModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
