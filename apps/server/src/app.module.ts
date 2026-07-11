import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';

import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { FilesModule } from './files/files.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RedisThrottlerStorage } from './common/throttler-redis.storage';
import { validateEnv, type Env } from './config/env';
import { HealthController } from './health/health.controller';
import { InvitesModule } from './invites/invites.module';
import { MessagesModule } from './messages/messages.module';
import { PresenceModule } from './presence/presence.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReadStatesModule } from './read-states/read-states.module';
import { REDIS, RedisModule } from './redis/redis.module';
import { SeedModule } from './seed/seed.module';
import { UsersModule } from './users/users.module';
import { WsModule } from './ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    // Общий лимит по умолчанию; точечные лимиты — через @Throttle на эндпоинтах
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => config.get('THROTTLE_DISABLED', { infer: true }) === '1',
      }),
    }),
    UsersModule,
    PresenceModule,
    AuthModule,
    InvitesModule,
    ChannelsModule,
    FilesModule,
    MessagesModule,
    ReadStatesModule,
    WsModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [
    // Порядок важен: rate limiting → аутентификация → права
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
