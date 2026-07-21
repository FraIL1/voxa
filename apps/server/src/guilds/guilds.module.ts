import { Module } from '@nestjs/common';

import { WsModule } from '../ws/ws.module';
import { GuildsController } from './guilds.controller';
import { GuildsService } from './guilds.service';
import { RolesService } from './roles.service';

@Module({
  imports: [WsModule],
  controllers: [GuildsController],
  providers: [GuildsService, RolesService],
  exports: [GuildsService],
})
export class GuildsModule {}
