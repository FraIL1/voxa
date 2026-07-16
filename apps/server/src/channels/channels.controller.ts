import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createCategorySchema,
  createChannelSchema,
  Permissions,
  updateCategorySchema,
  updateChannelSchema,
  type CategoryDto,
  type ChannelDto,
  type CommunityStructureDto,
  type CreateCategoryInput,
  type CreateChannelInput,
  type UpdateCategoryInput,
  type UpdateChannelInput,
} from '@voxa/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { ChannelsService } from './channels.service';

@Controller()
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly audit: AuditService,
  ) {}

  @Get('channels')
  async structure(@CurrentUser() user: RequestUser): Promise<CommunityStructureDto> {
    return this.channelsService.getStructure(user.id);
  }

  @Post('channels')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createChannel(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ): Promise<ChannelDto> {
    const dto = await this.channelsService.createChannel(body);
    this.audit.log(user.id, 'channel.create', { type: 'channel', id: dto.id }, { name: dto.name });
    return dto;
  }

  @Patch('channels/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateChannel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ): Promise<ChannelDto> {
    const dto = await this.channelsService.updateChannel(id, body);
    this.audit.log(user.id, 'channel.update', { type: 'channel', id }, { name: dto.name });
    return dto;
  }

  @Delete('channels/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteChannel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.channelsService.deleteChannel(id);
    this.audit.log(user.id, 'channel.delete', { type: 'channel', id });
  }

  @Post('categories')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createCategory(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryDto> {
    const dto = await this.channelsService.createCategory(body);
    this.audit.log(
      user.id,
      'category.create',
      { type: 'category', id: dto.id },
      { name: dto.name },
    );
    return dto;
  }

  @Patch('categories/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateCategory(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const dto = await this.channelsService.updateCategory(id, body);
    this.audit.log(user.id, 'category.update', { type: 'category', id }, { name: dto.name });
    return dto;
  }

  @Delete('categories/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteCategory(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.channelsService.deleteCategory(id);
    this.audit.log(user.id, 'category.delete', { type: 'category', id });
  }
}
