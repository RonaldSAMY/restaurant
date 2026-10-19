import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiRoutes,
  apiPath,
  LoginRequestSchema,
  type StaffMe,
} from '@restaurant/shared';
import type { CookieOptions, Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { readCookie } from '../common/cookies';
import type { PrincipalRequest } from '../common/default-deny.guard';
import { DomainError } from '../common/domain-error';
import { Public } from '../common/public.decorator';
import { AuthSessionService, type TokenPair } from './auth-session.service';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  StaffAuthGuard,
} from './staff-auth.guard';

/** Body DTO of `POST /api/v1/auth/login`. */
class LoginDto extends createZodDto(LoginRequestSchema) {}

/** Attributes shared by both auth cookies. */
const BASE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
};

/** Access cookie attributes: sent to every route. */
const ACCESS_OPTS: CookieOptions = { ...BASE, path: '/' };

/** Refresh cookie attributes: sent only to the auth routes. */
const REFRESH_OPTS: CookieOptions = { ...BASE, path: apiPath(ApiRoutes.auth) };

/** Sets both auth cookies. Expiry lives in the JWTs, not the cookies. */
function setCookies(res: Response, { access, refresh }: TokenPair): void {
  res.cookie(ACCESS_COOKIE, access, ACCESS_OPTS);
  res.cookie(REFRESH_COOKIE, refresh, REFRESH_OPTS);
}

/** Returns the staff principal set by {@link StaffAuthGuard}. */
function staff({ principal }: PrincipalRequest) {
  if (principal?.kind !== 'staff') {
    throw new DomainError('UNAUTHENTICATED', 'Authentication required');
  }
  return principal;
}

/** Staff login, token refresh, logout and identity. */
@Controller(ApiRoutes.auth)
export class AuthController {
  /** Receives the session service. */
  constructor(private readonly sessions: AuthSessionService) {}

  /** Logs in with email and password; 5 attempts per 60 s per client IP. */
  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StaffMe> {
    const { me, tokens } = await this.sessions.login(body);
    setCookies(res, tokens);
    return me;
  }

  /** Rotates the refresh cookie into a new pair; `401` on any failure. */
  @Public()
  @Post('refresh')
  @HttpCode(204)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    setCookies(
      res,
      await this.sessions.refresh(
        readCookie(req.headers.cookie, REFRESH_COOKIE),
      ),
    );
  }

  /** Ends the caller's session and clears both cookies. */
  @Post('logout')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard)
  async logout(
    @Req() req: Request & PrincipalRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.logout(
      staff(req).sid,
      readCookie(req.headers.cookie, REFRESH_COOKIE),
    );
    res.clearCookie(ACCESS_COOKIE, ACCESS_OPTS);
    res.clearCookie(REFRESH_COOKIE, REFRESH_OPTS);
  }

  /** Returns the logged-in staff user. */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffAuthGuard)
  me(@Req() req: PrincipalRequest): Promise<StaffMe> {
    return this.sessions.me(staff(req).staffId);
  }
}
