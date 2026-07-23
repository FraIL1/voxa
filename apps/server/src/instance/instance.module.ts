import { Global, Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { WsModule } from '../ws/ws.module';
import { InstanceController } from './instance.controller';
import { InstanceService } from './instance.service';

@Global()
@Module({
  imports: [WsModule, FilesModule],
  controllers: [InstanceController],
  providers: [InstanceService],
  exports: [InstanceService],
})
export class InstanceModule {}
