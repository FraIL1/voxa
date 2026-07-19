import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { WsModule } from '../ws/ws.module';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';

@Module({
  imports: [WsModule, FilesModule],
  controllers: [DmController],
  providers: [DmService],
})
export class DmModule {}
