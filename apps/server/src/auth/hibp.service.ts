import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import type { Env } from '../config/env';

/**
 * Проверка пароля по базе утечек haveibeenpwned (k-anonymity:
 * наружу уходят только первые 5 символов SHA-1, сам пароль — никогда).
 * При недоступности сервиса регистрация не блокируется (fail-open).
 */
@Injectable()
export class HibpService {
  private readonly logger = new Logger(HibpService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async isPwned(password: string): Promise<boolean> {
    if (this.config.get('HIBP_CHECK', { infer: true }) === 'off') return false;

    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        this.logger.warn(`HIBP вернул статус ${response.status}, проверка пропущена`);
        return false;
      }
      const body = await response.text();
      for (const line of body.split('\n')) {
        const [hashSuffix, countRaw] = line.trim().split(':');
        if (hashSuffix === suffix && Number(countRaw) > 0) return true;
      }
      return false;
    } catch {
      this.logger.warn('HIBP недоступен, проверка пароля по утечкам пропущена');
      return false;
    }
  }
}
