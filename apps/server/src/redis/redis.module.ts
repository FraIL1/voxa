import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const client = new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: 3,
        });
        // Молчаливый клиент роняет процесс на первой же ошибке соединения
        const logger = new Logger('Redis');
        client.on('error', (error: Error) => {
          if (client.status === 'end') return;
          logger.error(error.message);
        });
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.redis.removeAllListeners('error');
    this.redis.on('error', () => undefined);
    await this.redis.quit().catch(() => undefined);
  }
}
