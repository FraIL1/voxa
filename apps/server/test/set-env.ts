/**
 * Окружение e2e-тестов. Выполняется до загрузки приложения; значения из
 * process.env имеют приоритет над apps/server/.env (поведение @nestjs/config).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://voxa:voxa@localhost:5433/voxa?schema=e2e';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-0123456789';
process.env.PUBLIC_URL ??= 'http://localhost:3000';
// Внешний сервис в тестах не дёргаем, лимиты не мешают проверкам
process.env.HIBP_CHECK = 'off';
process.env.THROTTLE_DISABLED = '1';
// Отдельный бакет: локальные e2e не смешиваются с dev-файлами
process.env.S3_BUCKET ??= 'voxa-e2e';
process.env.LINK_PREVIEW = 'off';
