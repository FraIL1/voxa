import { Global, Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { WsModule } from '../ws/ws.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Global()
@Module({
  imports: [WsModule, FilesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
