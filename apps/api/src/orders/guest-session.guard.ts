import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { readCookie } from '../common/cookies';
import { type Principal, PrincipalGuard } from '../common/default-deny.guard';
import { GuestSessionService } from './guest-session.service';

/** Name of the cookie holding the Guest Session id. */
export const GUEST_SESSION_COOKIE = 'guest_session';

/** Admits a Guest with an open session as `{ kind: 'guest', sid, orderId }`. */
@Injectable()
export class GuestSessionGuard extends PrincipalGuard {
  /** Receives the session resolver. */
  constructor(private readonly sessions: GuestSessionService) {
    super();
  }

  /** Resolves the `guest_session` cookie, or `null` when it is not open. */
  async authenticate(context: ExecutionContext): Promise<Principal | null> {
    const req = context.switchToHttp().getRequest<Request>();
    const session = await this.sessions.resolve(
      readCookie(req.headers.cookie, GUEST_SESSION_COOKIE),
    );
    return (
      session && { kind: 'guest', sid: session.sid, orderId: session.order.id }
    );
  }
}
