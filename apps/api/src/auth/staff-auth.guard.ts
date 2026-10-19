import { type ExecutionContext, Injectable } from '@nestjs/common';
import { readContextCookie } from '../common/cookies';
import { type Principal, PrincipalGuard } from '../common/default-deny.guard';
import { AuthSessionService } from './auth-session.service';

/** Name of the cookie holding the staff access JWT (`Path=/`). */
export const ACCESS_COOKIE = 'access_token';

/** Name of the cookie holding the staff refresh JWT (`Path=/api/v1/auth`). */
export const REFRESH_COOKIE = 'refresh_token';

/**
 * The only source of the staff principal: admits a valid access token whose
 * session is live as `{ kind: 'staff', staffId, sid }`.
 */
@Injectable()
export class StaffAuthGuard extends PrincipalGuard {
  /** Receives the session resolver. */
  constructor(private readonly sessions: AuthSessionService) {
    super();
  }

  /** Resolves the `access_token` cookie, or `null`. */
  async authenticate(context: ExecutionContext): Promise<Principal | null> {
    const claims = await this.sessions.resolve(
      readContextCookie(context, ACCESS_COOKIE),
    );
    return claims && { kind: 'staff', ...claims };
  }
}
