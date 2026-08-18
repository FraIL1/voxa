import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createSupportTicketSchema,
  updateSupportTicketSchema,
  type CreateSupportTicketInput,
  type SupportTicketDto,
  type UpdateSupportTicketInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { InstanceOwnerGuard } from '../common/guards/instance-owner.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportService } from './support.service';

/** Отправка обращения: доступна любому вошедшему */
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /* Ограничение строже обычного: канал к владельцу нельзя превращать
     в поток однотипных сообщений. Пять обращений в час хватает с запасом. */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSupportTicketSchema)) input: CreateSupportTicketInput,
  ): Promise<SupportTicketDto> {
    return this.support.create(user.id, input);
  }
}

/** Разбор обращений — только владелец приложения */
@Controller('instance/support')
@UseGuards(InstanceOwnerGuard)
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(): Promise<SupportTicketDto[]> {
    return this.support.list();
  }

  /** Число необработанных — для точки на разделе, чтобы не открывать список зря */
  @Get('count')
  async count(): Promise<{ newCount: number }> {
    return { newCount: await this.support.countNew() };
  }

  @Patch(':id')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupportTicketSchema)) input: UpdateSupportTicketInput,
  ): Promise<SupportTicketDto> {
    return this.support.setStatus(id, input);
  }
}
