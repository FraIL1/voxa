import { defineConfig, devices } from '@playwright/test';

/**
 * UI-тесты идут по живому приложению в браузере. Стенд поднимается свой:
 * отдельный бэкенд на 3100 со схемой ui_test в dev-базе и свой vite на 5174,
 * чтобы прогон никак не задевал рабочие данные разработчика (порты 3000/5173).
 */
const DB =
  process.env.UI_TEST_DATABASE_URL ?? 'postgresql://voxa:voxa@localhost:5433/voxa?schema=ui_test';
const API_PORT = 3100;
const WEB_PORT = 5174;

export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const TEST_DB_URL = DB;

const serverEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: DB,
  PORT: String(API_PORT),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  PUBLIC_URL: BASE_URL,
  // На стенде лимиты запросов мешают: подготовка регистрирует аккаунты, а
  // сценарии логинятся заново на каждом прогоне
  THROTTLE_DISABLED: '1',
  JWT_ACCESS_SECRET: 'ui-test-access-secret-000000000000',
  JWT_REFRESH_SECRET: 'ui-test-refresh-secret-00000000000',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'voxa',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'voxa-dev-minio',
  S3_BUCKET: 'voxa-ui-test',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'voxa-dev',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'voxa-dev-livekit-secret-0123456789abcdef',
  PUBLIC_LIVEKIT_URL: process.env.PUBLIC_LIVEKIT_URL ?? 'ws://localhost:7880',
} as Record<string, string>;

export default defineConfig({
  testDir: './tests/ui',
  globalSetup: './tests/ui/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'tests/ui/report', open: 'never' }]],
  outputDir: 'tests/ui/artifacts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Микрофон/камера в звонках — без диалогов разрешений
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command:
        'pnpm --filter @voxa/server exec prisma migrate deploy && node apps/server/dist/main.js',
      url: `${API_URL}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: serverEnv,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @voxa/web exec vite --port ${WEB_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, VITE_API_TARGET: API_URL } as Record<string, string>,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
