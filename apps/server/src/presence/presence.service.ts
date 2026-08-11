import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { PresenceMode, PresenceStatus } from '@voxa/shared';
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
 *
 * Показываемый статус складывается из трёх вещей: есть ли сокеты, что
 * человек выбрал сам (режим) и не простаивает ли он прямо сейчас.
 */
@Injectable()
export class PresenceService implements OnApplicationShutdown {
  private readonly sockets = new Map<string, Set<string>>();
  /** Выбор пользователя; подтягивается из БД при подключении */
  private readonly modes = new Map<string, PresenceMode>();
  /** Простаивающие сокеты по пользователям: userId → id сокетов */
  private readonly idleSockets = new Map<string, Set<string>>();
  private readonly refreshTimer: NodeJS.Timeout;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.refreshTimer = setInterval(() => void this.refreshTtls(), REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.refreshTimer);
  }

  /** true — пользователь только что перешёл в онлайн (первый сокет) */
  async connected(
    userId: string,
    socketId: string,
    mode: PresenceMode = 'ONLINE',
  ): Promise<boolean> {
    let set = this.sockets.get(userId);
    const becameOnline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socketId);
    // Новое окно всегда активно: свёрнутый десктоп не должен помечать его
    this.idleSockets.get(userId)?.delete(socketId);
    this.modes.set(userId, mode);
    await this.redis.set(presenceKey(userId), '1', 'EX', PRESENCE_TTL_S);
    return becameOnline;
  }

  /** true — пользователь ушёл в офлайн (закрыт последний сокет) */
  async disconnected(userId: string, socketId: string): Promise<boolean> {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    this.idleSockets.get(userId)?.delete(socketId);
    if (set.size > 0) return false;

    this.sockets.delete(userId);
    this.modes.delete(userId);
    this.idleSockets.delete(userId);
    await this.redis.del(presenceKey(userId));
    return true;
  }

  /** Смена режима из настроек — состояние переживает до отключения сокетов */
  setMode(userId: string, mode: PresenceMode): void {
    if (this.sockets.has(userId)) this.modes.set(userId, mode);
  }

  /**
   * Клиент сообщает о простое. Учитываем каждое окно отдельно: человек
   * отошёл, только когда простаивают ВСЕ его клиенты. Иначе свёрнутый
   * десктоп помечал бы «отошёл» и активную вкладку в браузере.
   */
  setIdle(userId: string, socketId: string, value: boolean): void {
    let idle = this.idleSockets.get(userId);
    if (!idle) {
      idle = new Set();
      this.idleSockets.set(userId, idle);
    }
    if (value) idle.add(socketId);
    else idle.delete(socketId);
  }

  /** Все ли окна пользователя простаивают */
  private isIdle(userId: string): boolean {
    const sockets = this.sockets.get(userId);
    if (!sockets || sockets.size === 0) return false;
    const idle = this.idleSockets.get(userId);
    if (!idle || idle.size === 0) return false;
    return [...sockets].every((id) => idle.has(id));
  }

  /** Есть ли живые сокеты (для счётчиков панели владельца) */
  onlineUserIds(): Set<string> {
    return new Set(this.sockets.keys());
  }

  /**
   * Статус, который видят другие. Невидимка выглядит как офлайн — в этом
   * весь смысл режима, поэтому отдельного значения для него нет.
   */
  statusOf(userId: string): PresenceStatus {
    if (!this.sockets.has(userId)) return 'offline';
    const mode = this.modes.get(userId) ?? 'ONLINE';
    if (mode === 'INVISIBLE') return 'offline';
    if (mode === 'DND') return 'dnd';
    if (mode === 'IDLE' || this.isIdle(userId)) return 'idle';
    return 'online';
  }

  /** Функция-снимок для списков: не дёргает карты на каждого участника */
  snapshot(): (userId: string) => PresenceStatus {
    return (userId) => this.statusOf(userId);
  }

  private async refreshTtls(): Promise<void> {
    const ids = [...this.sockets.keys()];
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.redis.expire(presenceKey(id), PRESENCE_TTL_S))).catch(
      () => undefined,
    );
  }
}
