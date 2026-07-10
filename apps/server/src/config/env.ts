import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET должен быть не короче 16 символов'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET должен быть не короче 16 символов'),
  /** Внешний адрес приложения — для инвайт-ссылок */
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /** Origin веб-клиента в dev (CORS). В проде не задаётся: same-origin через Caddy */
  WEB_ORIGIN: z.string().url().optional(),
  /** Проверка паролей по базе утечек haveibeenpwned */
  HIBP_CHECK: z.enum(['on', 'off']).default('on'),
  /** Отключение rate limiting (только для тестов) */
  THROTTLE_DISABLED: z.enum(['0', '1']).default('0'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }
  return result.data;
}
