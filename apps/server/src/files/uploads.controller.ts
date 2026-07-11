import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Permissions, type AttachmentDto } from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { FilesService } from './files.service';

/**
 * busboy (внутри multer) читает filename как latin1 — кириллица ломается.
 * Перекодируем в utf8; если результат содержит U+FFFD, оставляем как есть.
 */
function decodeOriginalName(name: string): string {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly files: FilesService) {}

  /** Лимит размера файла задаётся в MulterModule (files.module) */
  @Post()
  @RequirePermissions(Permissions.UPLOAD_FILES)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<AttachmentDto> {
    if (!file) throw new BadRequestException('Файл не передан (поле file)');
    return this.files.store(user.id, {
      originalname: decodeOriginalName(file.originalname),
      buffer: file.buffer,
      size: file.size,
    });
  }
}
