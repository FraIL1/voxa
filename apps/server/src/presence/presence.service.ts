import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS } from '../redis/redis.module';

/** TTL ключа присутствия; периодически продлевается, пока сокеты живы */
const PRESENCE_TTL_S = 70;
const REFRESH_INTERVAL_MS = 30_000;

function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

/**
 * Присутствие пользователей. Источник истины для одного инстанса —
 * карта userId → сокеты; Redis-ключи с TTL дублируют состояние
 * (раздел 8.1 PRD) и самоочищаются при аварийной остановке сервера.
 */
@Injectable()
export class PresenceService implements OnApplicationShutdown {
  private readonly sockets = new Map<string, Set<string>>();
  private readonly refreshTimer: NodeJS.Timeout;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.refreshTimer = setInterval(() => void this.refreshTtls(), REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.refreshTimer);
  }

  /** true — пользователь только что перешёл в онлайн (первый сокет) */
  async connected(userId: string, socketId: string): Promise<boolean> {
    let set = this.sockets.get(userId);
    const becameOnline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    await this.redis.set(presenceKey(userId), '1', 'EX', PRESENCE_TTL_S);
    return becameOnline;
  }

  /** true — пользователь ушёл в офлайн (закрыт последний сокет) */
  async disconnected(userId: string, socketId: string): Promise<boolean> {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size > 0) return false;

    this.sockets.delete(userId);
    await this.redis.del(presenceKey(userId));
    return true;
  }

  onlineUserIds(): Set<string> {
    return new Set(this.sockets.keys());
  }

  private async refreshTtls(): Promise<void> {
    const ids = [...this.sockets.keys()];
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.redis.expire(presenceKey(id), PRESENCE_TTL_S))).catch(
      () => undefined,
    );
  }
}
