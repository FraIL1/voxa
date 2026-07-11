import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import type { Env } from '../config/env';
import { FilesService } from './files.service';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
