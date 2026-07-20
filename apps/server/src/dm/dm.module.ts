import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { FriendsModule } from '../friends/friends.module';
import { WsModule } from '../ws/ws.module';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';

@Module({
  imports: [WsModule, FilesModule, FriendsModule],
  controllers: [DmController],
  providers: [DmService],
})
export class DmModule {}
