import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { LinkPreviewModule } from '../link-preview/link-preview.module';
import { ReadStatesModule } from '../read-states/read-states.module';
import { WsModule } from '../ws/ws.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [WsModule, ReadStatesModule, FilesModule, LinkPreviewModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
