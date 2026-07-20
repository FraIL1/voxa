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

  @Get('guilds/:guildId/structure')
  async structure(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
  ): Promise<CommunityStructureDto> {
    return this.channelsService.getStructure(user.id, guildId);
  }

  @Post('guilds/:guildId/channels')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createChannel(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ): Promise<ChannelDto> {
    const dto = await this.channelsService.createChannel(guildId, body);
    this.audit.log(
      guildId,
      user.id,
      'channel.create',
      { type: 'channel', id: dto.id },
      { name: dto.name },
    );
    return dto;
  }

  @Patch('channels/:channelId')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateChannel(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ): Promise<ChannelDto> {
    const dto = await this.channelsService.updateChannel(channelId, body);
    this.audit.log(
      dto.guildId,
      user.id,
      'channel.update',
      { type: 'channel', id: channelId },
      { name: dto.name },
    );
    return dto;
  }

  @Delete('channels/:channelId')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteChannel(
    @CurrentUser() user: RequestUser,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ): Promise<void> {
    const guildId = await this.channelsService.deleteChannel(channelId);
    this.audit.log(guildId, user.id, 'channel.delete', { type: 'channel', id: channelId });
  }

  @Post('guilds/:guildId/categories')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createCategory(
    @CurrentUser() user: RequestUser,
    @Param('guildId') guildId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryDto> {
    const dto = await this.channelsService.createCategory(guildId, body);
    this.audit.log(
      guildId,
      user.id,
      'category.create',
      { type: 'category', id: dto.id },
      { name: dto.name },
    );
    return dto;
  }

  @Patch('categories/:categoryId')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateCategory(
    @CurrentUser() user: RequestUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const dto = await this.channelsService.updateCategory(categoryId, body);
    this.audit.log(
      dto.guildId,
      user.id,
      'category.update',
      { type: 'category', id: categoryId },
      { name: dto.name },
    );
    return dto;
  }

  @Delete('categories/:categoryId')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteCategory(
    @CurrentUser() user: RequestUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    const guildId = await this.channelsService.deleteCategory(categoryId);
    this.audit.log(guildId, user.id, 'category.delete', { type: 'category', id: categoryId });
  }
}
