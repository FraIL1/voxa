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

  // S3 (MinIO). Дефолты совпадают с docker-compose.dev.yml
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().min(1).default('voxa'),
  S3_SECRET_KEY: z.string().min(1).default('voxa-dev-minio'),
  S3_BUCKET: z.string().min(1).default('voxa-files'),
  /** Публичный адрес S3 для подписанных ссылок (в проде — https://files.домен) */
  PUBLIC_S3_ENDPOINT: z.string().url().optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(50),
  /** Квота хранилища на пользователя (раздел 10 PRD) */
  USER_QUOTA_MB: z.coerce.number().int().min(1).default(2048),
  /** Предпросмотр ссылок (в CI выключен: нет сети) */
  LINK_PREVIEW: z.enum(['on', 'off']).default('on'),

  // LiveKit (голос). Дефолты совпадают с infra/livekit/livekit.dev.yaml
  LIVEKIT_API_KEY: z.string().min(1).default('voxa-dev'),
  LIVEKIT_API_SECRET: z.string().min(32).default('voxa-dev-livekit-secret-0123456789abcdef'),
  /** Адрес LiveKit для клиентов (в проде — wss://livekit.домен) */
  PUBLIC_LIVEKIT_URL: z.string().url().default('ws://localhost:7880'),
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
