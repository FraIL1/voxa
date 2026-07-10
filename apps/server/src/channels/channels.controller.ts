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
import { ChannelsService } from './channels.service';

@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get('channels')
  async structure(@CurrentUser() user: RequestUser): Promise<CommunityStructureDto> {
    return this.channelsService.getStructure(user.id);
  }

  @Post('channels')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createChannel(
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ): Promise<ChannelDto> {
    return this.channelsService.createChannel(body);
  }

  @Patch('channels/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ): Promise<ChannelDto> {
    return this.channelsService.updateChannel(id, body);
  }

  @Delete('channels/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteChannel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.channelsService.deleteChannel(id);
  }

  @Post('categories')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async createCategory(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryDto> {
    return this.channelsService.createCategory(body);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return this.channelsService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permissions.MANAGE_CHANNELS)
  @HttpCode(204)
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.channelsService.deleteCategory(id);
  }
}
