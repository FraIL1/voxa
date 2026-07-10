import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  type AuthResponseDto,
  type ChangePasswordInput,
  type LoginInput,
  type MeDto,
  type RegisterInput,
} from '@voxa/shared';
import type { Request, Response } from 'express';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Env } from '../config/env';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

export const REFRESH_COOKIE = 'voxa_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private clientMeta(req: Request): { ip?: string; userAgent?: string } {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setRefreshCookie(res: Response, token: string, expires: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      expires,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  private refreshTokenFrom(req: Request): string {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Refresh-токен отсутствует');
    return token;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { tokens, user } = await this.authService.register(body, this.clientMeta(req));
    this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
    return { accessToken: tokens.accessToken, user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { tokens, user } = await this.authService.login(body, this.clientMeta(req));
    this.setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
    return { accessToken: tokens.accessToken, user };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const refreshToken = this.refreshTokenFrom(req);
    try {
      const rotated = await this.tokensService.rotate(refreshToken, this.clientMeta(req));
      this.setRefreshCookie(res, rotated.refreshToken, rotated.refreshExpiresAt);
      return {
        accessToken: rotated.accessToken,
        user: await this.usersService.getMe(rotated.userId),
      };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (token) await this.tokensService.revokeByToken(token);
    this.clearRefreshCookie(res);
  }

  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.tokensService.revokeAll(user.id);
    this.clearRefreshCookie(res);
  }

  @HttpCode(204)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.authService.changePassword(
      user.id,
      user.sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<MeDto> {
    return this.usersService.getMe(user.id);
  }
}
