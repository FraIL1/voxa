import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * socket.io-адаптер с Redis pub/sub: события доходят до всех клиентов
 * даже при нескольких инстансах сервера, а socketsJoin/Leave работают
 * между инстансами.
 */
export class RedisIoAdapter extends IoAdapter {
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(
    app: INestApplication,
    private readonly redisUrl: string,
    private readonly corsOrigin?: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    this.pubClient = new Redis(this.redisUrl, { maxRetriesPerRequest: 3 });
    this.subClient = this.pubClient.duplicate();

    const server = super.createIOServer(port, {
      ...options,
      cors: this.corsOrigin ? { origin: this.corsOrigin, credentials: true } : undefined,
    }) as Server;
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.pubClient?.quit().catch(() => undefined);
    await this.subClient?.quit().catch(() => undefined);
  }
}
