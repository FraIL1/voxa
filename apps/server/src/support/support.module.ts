import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SupportAdminController, SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [PrismaModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
