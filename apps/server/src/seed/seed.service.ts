import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permissions } from '@voxa/shared';

import type { Env } from '../config/env';
import { generateInviteCode } from '../invites/invites.service';
import { PrismaService } from '../prisma/prisma.service';

const SEED_KEY = 'seed:v1';

const MODERATOR_MASK =
  Permissions.DELETE_MESSAGES |
  Permissions.KICK_MEMBERS |
  Permissions.BAN_MEMBERS |
  Permissions.MUTE_MEMBERS |
  Permissions.CREATE_INVITES |
  Permissions.MENTION_EVERYONE |
  Permissions.UPLOAD_FILES |
  Permissions.SEND_MESSAGES;

const MEMBER_MASK = Permissions.SEND_MESSAGES | Permissions.UPLOAD_FILES;

/**
 * Стартовые данные при первом запуске с пустой БД: сервер «Voxa» с ролями,
 * категориями, каналами и одноразовым bootstrap-инвайтом Владельца.
 * Инвайт восстанавливается при каждом старте, пока Владелец не появился.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedOnce();
    await this.ensureOwnerBootstrapInvite();
  }

  private async seedOnce(): Promise<void> {
    const done = await this.prisma.appMeta.findUnique({ where: { key: SEED_KEY } });
    if (done) return;

    await this.prisma.$transaction(async (tx) => {
      const guild = await tx.guild.create({ data: { name: 'Voxa' } });

      await tx.role.createMany({
        data: [
          {
            guildId: guild.id,
            name: 'Владелец',
            color: '#FF7A45',
            permissions: Permissions.ADMINISTRATOR,
            position: 100,
            isOwnerRole: true,
          },
          {
            guildId: guild.id,
            name: 'Модератор',
            color: '#4EA8DE',
            permissions: MODERATOR_MASK,
            position: 50,
          },
          {
            guildId: guild.id,
            name: 'Участник',
            permissions: MEMBER_MASK,
            position: 0,
            isDefault: true,
          },
        ],
        skipDuplicates: true,
      });

      const textCategory = await tx.category.create({
        data: { guildId: guild.id, name: 'Текст', position: 0 },
      });
      const voiceCategory = await tx.category.create({
        data: { guildId: guild.id, name: 'Голос', position: 1 },
      });

      await tx.channel.createMany({
        data: [
          {
            guildId: guild.id,
            name: 'общий',
            type: 'TEXT',
            categoryId: textCategory.id,
            position: 0,
          },
          {
            guildId: guild.id,
            name: 'мемы',
            type: 'TEXT',
            categoryId: textCategory.id,
            position: 1,
          },
          {
            guildId: guild.id,
            name: 'важное',
            type: 'TEXT',
            categoryId: textCategory.id,
            position: 2,
          },
          {
            guildId: guild.id,
            name: 'Общий',
            type: 'VOICE',
            categoryId: voiceCategory.id,
            position: 0,
          },
          {
            guildId: guild.id,
            name: 'Игры',
            type: 'VOICE',
            categoryId: voiceCategory.id,
            position: 1,
          },
          {
            guildId: guild.id,
            name: 'AFK',
            type: 'VOICE',
            categoryId: voiceCategory.id,
            position: 2,
          },
        ],
      });

      await tx.appMeta.create({ data: { key: SEED_KEY, value: guild.id } });
    });

    this.logger.log('Создан стартовый сервер «Voxa» (роли, категории, каналы)');
  }

  private async ensureOwnerBootstrapInvite(): Promise<void> {
    const ownerRole = await this.prisma.role.findFirst({
      where: { isOwnerRole: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!ownerRole) return;

    const ownerExists = await this.prisma.userRole.findFirst({
      where: { roleId: ownerRole.id },
    });
    if (ownerExists) return;

    let invite = await this.prisma.invite.findFirst({
      where: { grantsRoleId: ownerRole.id, revokedAt: null, uses: 0 },
    });
    invite ??= await this.prisma.invite.create({
      data: {
        code: generateInviteCode(),
        guildId: ownerRole.guildId,
        grantsRoleId: ownerRole.id,
        maxUses: 1,
      },
    });

    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    this.logger.warn('==========================================================');
    this.logger.warn('Владелец ещё не зарегистрирован. Одноразовый инвайт Владельца:');
    this.logger.warn(`  Код инвайта: ${invite.code}`);
    this.logger.warn(`  Ссылка: ${publicUrl}/invite/${invite.code}`);
    this.logger.warn('Первый зарегистрировавшийся по нему получит роль «Владелец».');
    this.logger.warn('==========================================================');
  }
}
