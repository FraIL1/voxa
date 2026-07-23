import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Attachment } from '@prisma/client';
import type { AttachmentDto, AttachmentKind } from '@voxa/shared';
import { Jimp } from 'jimp';
import { randomUUID } from 'node:crypto';

import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { detectMedia, isExecutable } from './file-type';

/** Подписанные ссылки живут час; клиент получает свежие при каждом запросе истории */
const SIGNED_URL_TTL_S = 3600;
const THUMB_MAX_PX = 512;

export interface UploadedFileInput {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly bucket: string;
  /** Клиент для операций (внутренний адрес) */
  private readonly s3: S3Client;
  /** Клиент только для подписи ссылок (публичный адрес) */
  private readonly s3Public: S3Client;
  private readonly quotaBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.quotaBytes = config.get('USER_QUOTA_MB', { infer: true }) * 1024 * 1024;

    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const publicEndpoint = config.get('PUBLIC_S3_ENDPOINT', { infer: true }) ?? endpoint;
    const credentials = {
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
    };
    // forcePathStyle: MinIO не использует поддомены-бакеты
    const base = { region: 'us-east-1', credentials, forcePathStyle: true };
    this.s3 = new S3Client({ ...base, endpoint });
    this.s3Public = new S3Client({ ...base, endpoint: publicEndpoint });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Создан бакет ${this.bucket}`);
    }
  }

  private kindOf(contentType: string): AttachmentKind {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    return 'file';
  }

  /** Санитизация имени: только базовое имя, без управляющих символов */
  private safeFileName(original: string): string {
    const base = original.split(/[\\/]/).pop() ?? 'file';
    // eslint-disable-next-line no-control-regex
    const clean = base.replace(/[\x00-\x1f"<>|:*?]/g, '_').slice(0, 180);
    return clean.length > 0 ? clean : 'file';
  }

  async store(uploaderId: string, file: UploadedFileInput): Promise<AttachmentDto> {
    if (isExecutable(file.buffer, file.originalname)) {
      throw new BadRequestException('Исполняемые файлы запрещены');
    }

    const used = await this.prisma.attachment.aggregate({
      where: { uploaderId },
      _sum: { size: true },
    });
    if ((used._sum.size ?? 0) + file.size > this.quotaBytes) {
      throw new BadRequestException('Превышена квота хранилища');
    }

    const media = detectMedia(file.buffer);
    const contentType = media?.mime ?? 'application/octet-stream';
    const fileName = this.safeFileName(file.originalname);
    const id = randomUUID();
    const key = `${id}/${fileName}`;

    // Не-медиа всегда отдаётся как скачивание — не даём браузеру исполнять
    const disposition = media ? 'inline' : `attachment; filename="${encodeURIComponent(fileName)}"`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        ContentDisposition: disposition,
      }),
    );

    // Миниатюра и размеры — только для изображений. jimp (MIT, без нативных
    // модулей — раздел 11 PRD) не читает webp: такие вложения рендерятся
    // клиентом в полном размере, это осознанный компромисс.
    let width: number | null = null;
    let height: number | null = null;
    let thumbKey: string | null = null;
    if (media?.isImage && media.ext !== 'webp') {
      try {
        const image = await Jimp.read(file.buffer);
        width = image.width;
        height = image.height;
        if (Math.max(image.width, image.height) > THUMB_MAX_PX) {
          image.scaleToFit({ w: THUMB_MAX_PX, h: THUMB_MAX_PX });
        }
        // png сохраняет прозрачность (в т.ч. для gif), jpeg — компактнее для фото
        const asPng = media.ext !== 'jpg';
        const thumb = asPng
          ? await image.getBuffer('image/png')
          : await image.getBuffer('image/jpeg', { quality: 80 });
        thumbKey = `${id}/thumb.${asPng ? 'png' : 'jpg'}`;
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: thumbKey,
            Body: thumb,
            ContentType: asPng ? 'image/png' : 'image/jpeg',
            ContentDisposition: 'inline',
          }),
        );
      } catch (error) {
        // Битая картинка — не срываем загрузку, просто без миниатюры
        this.logger.warn(`Не удалось построить миниатюру: ${(error as Error).message}`);
      }
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId,
        key,
        thumbKey,
        fileName,
        contentType,
        size: file.size,
        width,
        height,
      },
    });

    return this.toDto(attachment);
  }

  private presign(key: string): Promise<string> {
    return getSignedUrl(this.s3Public, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: SIGNED_URL_TTL_S,
    });
  }

  async toDto(attachment: Attachment): Promise<AttachmentDto> {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      kind: this.kindOf(attachment.contentType),
      url: await this.presign(attachment.key),
      thumbUrl: attachment.thumbKey ? await this.presign(attachment.thumbKey) : null,
    };
  }

  /**
   * Привязка загруженных файлов к сообщению. Файлы должны принадлежать
   * автору и быть ещё не привязанными.
   */
  async attachToMessage(uploaderId: string, messageId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { count } = await this.prisma.attachment.updateMany({
      where: { id: { in: ids }, uploaderId, messageId: null, dmMessageId: null },
      data: { messageId },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Некоторые вложения не найдены или уже использованы');
    }
  }

  /**
   * Удаление вложений сообщения: файлы уходят из хранилища и из БД, чтобы
   * не занимать квоту автора после удаления сообщения.
   */
  async removeForMessage(where: { messageId?: string; dmMessageId?: string }): Promise<void> {
    const attachments = await this.prisma.attachment.findMany({
      where,
      select: { id: true, key: true, thumbKey: true },
    });
    if (attachments.length === 0) return;

    const keys = attachments.flatMap((a) => [
      { Key: a.key },
      ...(a.thumbKey ? [{ Key: a.thumbKey }] : []),
    ]);
    try {
      await this.s3.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }),
      );
    } catch (error) {
      // Файл мог исчезнуть из хранилища раньше — запись всё равно чистим
      this.logger.warn(`Не удалось удалить файлы из хранилища: ${(error as Error).message}`);
    }
    await this.prisma.attachment.deleteMany({
      where: { id: { in: attachments.map((a) => a.id) } },
    });
  }

  /** Привязка загруженных вложений к личному сообщению */
  async attachToDmMessage(uploaderId: string, dmMessageId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { count } = await this.prisma.attachment.updateMany({
      where: { id: { in: ids }, uploaderId, messageId: null, dmMessageId: null },
      data: { dmMessageId },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Некоторые вложения не найдены или уже использованы');
    }
  }
}
