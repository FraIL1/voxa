import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  updatePresenceSchema,
  updateProfileSchema,
  userNoteSchema,
  type MeDto,
  type UpdatePresenceInput,
  type UpdateProfileInput,
  type UserNoteInput,
  type UserProfileDto,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PresenceService } from '../presence/presence.service';
import { WsGateway } from '../ws/ws.gateway';
import { UsersService } from './users.service';

/** Аватар обрезается до 256×256, поэтому большой исходник смысла не имеет */
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
    private readonly ws: WsGateway,
  ) {}

  @Patch('me')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeDto> {
    const me = await this.usersService.updateProfile(user.id, body);
    await this.ws.handleUserRenamed(me);
    return me;
  }

  /** Режим присутствия и своя строчка статуса */
  @Patch('me/presence')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async updatePresence(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updatePresenceSchema)) body: UpdatePresenceInput,
  ): Promise<MeDto> {
    const me = await this.usersService.updatePresence(user.id, body);
    if (body.mode) await this.ws.broadcastPresenceMode(user.id, body.mode);
    // Строчка статуса живёт в тех же карточках, что и имя
    if (body.statusText !== undefined) await this.ws.handleUserRenamed(me);
    return me;
  }

  @Post('me/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  async setAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MeDto> {
    if (!file) throw new BadRequestException('Файл не передан (поле file)');
    if (file.size > MAX_AVATAR_BYTES) throw new BadRequestException('Картинка больше 8 МБ');
    const me = await this.usersService.setAvatar(user.id, file.buffer);
    await this.ws.handleUserRenamed(me);
    return me;
  }

  @Delete('me/avatar')
  async removeAvatar(@CurrentUser() user: RequestUser): Promise<MeDto> {
    const me = await this.usersService.removeAvatar(user.id);
    await this.ws.handleUserRenamed(me);
    return me;
  }

  /** Личная заметка и своё имя для человека — видит только автор */
  @Patch(':userId/note')
  setNote(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(userNoteSchema)) body: UserNoteInput,
  ): Promise<{ note: string | null; alias: string | null }> {
    return this.usersService.setNote(user.id, userId, body);
  }

  /** Карточка профиля другого участника */
  @Get(':userId/profile')
  getProfile(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserProfileDto> {
    return this.usersService.getProfile(user.id, userId, this.presence.snapshot());
  }
}
