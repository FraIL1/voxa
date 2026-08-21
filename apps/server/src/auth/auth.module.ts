import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HibpService } from './hibp.service';
import { TokensService } from './tokens.service';

export const ACCESS_TOKEN_TTL = '15m';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL, algorithm: 'HS256' },
        /* Алгоритм закреплён явно: иначе проверка принимает любой, каким
           подписан сам токен, и подпись становится предметом торга с тем,
           кто её прислал. Наследуется всеми verifyAsync (guard и WS). */
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, HibpService],
  exports: [TokensService],
})
export class AuthModule {}
