import { Module } from '@nestjs/common';

import { WsModule } from '../ws/ws.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [WsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
