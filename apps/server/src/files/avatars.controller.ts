import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

/**
 * Отдача аватара по стабильной ссылке. Тег <img> не умеет слать заголовок
 * авторизации, поэтому маршрут открыт: аватар — не тайна, а имя объекта
 * содержит случайный uuid, по которому чужой файл не подобрать.
 */
@Controller('avatars')
export class AvatarsController {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get(':userId/:file')
  async get(
    @Param('userId') userId: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    const key = `avatars/${userId}/${file}`;
    if (!user?.avatarKey || user.avatarKey !== key) {
      throw new NotFoundException('Аватар не найден');
    }

    // Ссылка на хранилище подписана и живёт час; браузеру разрешаем держать
    // редирект пять минут — картинка неизменна, ключ меняется при замене
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.redirect(302, await this.files.signedUrlFor(key));
  }
}
