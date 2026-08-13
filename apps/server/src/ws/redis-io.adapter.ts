import { Logger, type INestApplication } from '@nestjs/common';
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
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: Redis;
  private subClient?: Redis;
  /** Идёт остановка: ошибки закрывающихся соединений — не сбой */
  private closing = false;

  /**
   * Без своего обработчика ioredis роняет процесс: при остановке он
   * сообщает «Connection is closed» по незавершённым командам, и это
   * всплывало как падение всего прогона тестов.
   */
  private watch(client: Redis, name: string): void {
    client.on('error', (error: Error) => {
      if (this.closing) return;
      this.logger.error(`${name}: ${error.message}`);
    });
  }

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
    this.watch(this.pubClient, 'pub');
    this.watch(this.subClient, 'sub');

    const server = super.createIOServer(port, {
      ...options,
      cors: this.corsOrigin ? { origin: this.corsOrigin, credentials: true } : undefined,
    }) as Server;
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  override async close(server: Server): Promise<void> {
    this.closing = true;
    await super.close(server);
    await this.pubClient?.quit().catch(() => undefined);
    await this.subClient?.quit().catch(() => undefined);
  }
}
