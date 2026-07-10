import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';

/**
 * Хранилище счётчиков rate limiting в Redis (переживает рестарты
 * и остаётся корректным при нескольких инстансах сервера).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${counterKey}:block`;

    const blockTtlMs = await this.redis.pttl(blockKey);
    if (blockTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    const totalHits = await this.redis.incr(counterKey);
    if (totalHits === 1) {
      await this.redis.pexpire(counterKey, ttl);
    }
    let timeToExpireMs = await this.redis.pttl(counterKey);
    if (timeToExpireMs < 0) {
      await this.redis.pexpire(counterKey, ttl);
      timeToExpireMs = ttl;
    }

    if (totalHits > limit) {
      const blockMs = blockDuration > 0 ? blockDuration : timeToExpireMs;
      await this.redis.set(blockKey, '1', 'PX', blockMs);
      return {
        totalHits,
        timeToExpire: Math.ceil(timeToExpireMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockMs / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
