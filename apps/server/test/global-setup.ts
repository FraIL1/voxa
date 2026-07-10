import { execSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Перед запуском тестов пересоздаёт схему e2e в dev-базе и применяет
 * миграции. Работает и локально, и в CI (нужны запущенные Postgres и Redis).
 */
export default function globalSetup(): void {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgresql://voxa:voxa@localhost:5433/voxa?schema=e2e';

  execSync('pnpm exec prisma migrate reset --force --skip-generate --skip-seed', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
