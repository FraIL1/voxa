import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@voxa/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';

import { AppModule } from './app.module';
import type { Env } from './config/env';
import { RedisIoAdapter } from './ws/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  app.use(cookieParser());

  const express = app.getHttpAdapter().getInstance() as Express;
  // Реальный IP клиента за обратным прокси (Caddy) — для rate limiting и логов
  express.set('trust proxy', 1);
  express.disable('x-powered-by');

  // В проде CORS не нужен (same-origin через Caddy); в dev веб-клиент на другом порту
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  if (webOrigin) {
    app.enableCors({ origin: webOrigin, credentials: true });
  }

  app.useWebSocketAdapter(
    new RedisIoAdapter(app, config.get('REDIS_URL', { infer: true }), webOrigin),
  );

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Voxa server запущен на порту ${port}`);
}

void bootstrap();
