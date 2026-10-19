import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Socket } from 'socket.io';
import { DomainError } from './domain-error';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Authenticated caller (AD-4); a future Customer is a third `kind`. */
export type Principal =
  | { kind: 'staff'; staffId: string; sid: string }
  | { kind: 'guest'; sid: string; orderId: string };

/** Request (HTTP) or socket `data` (ws) after a {@link PrincipalGuard} has admitted it. */
export type PrincipalRequest = {
  /** Set by {@link PrincipalGuard.canActivate}; absent on `@Public()` routes. */
  principal?: Principal;
};

/**
 * Base class for guards that establish a principal (staff or guest).
 * Subclasses implement {@link PrincipalGuard.authenticate} only: `canActivate`
 * is final, and {@link DefaultDenyGuard} denies any subclass that overrides it,
 * so an admitted request always carries `req.principal` (on ws:
 * `client.data.principal`).
 */
export abstract class PrincipalGuard implements CanActivate {
  /** Pins `canActivate` on the instance, so a class-field override throws at construction. */
  constructor() {
    Object.defineProperty(this, 'canActivate', {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- unbound on purpose: DefaultDenyGuard compares identity; called as a method
      value: PrincipalGuard.prototype.canActivate,
      writable: false,
      configurable: false,
    });
  }

  /** Resolves the caller's principal, or `null` when there is none. */
  abstract authenticate(
    context: ExecutionContext,
  ): Principal | null | Promise<Principal | null>;

  /**
   * Sets `req.principal` (ws: `client.data.principal`), or throws
   * `401 UNAUTHENTICATED` when there is none. Final.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const principal = await this.authenticate(context);
    if (!principal) {
      throw new DomainError('UNAUTHENTICATED', 'Authentication required');
    }
    const target: PrincipalRequest =
      context.getType() === 'ws'
        ? context
            .switchToWs()
            .getClient<Socket<never, never, never, PrincipalRequest>>().data
        : context.switchToHttp().getRequest<PrincipalRequest>();
    target.principal = principal;
    return true;
  }
}

/** Whether `g` (a guard class or instance) is a {@link PrincipalGuard} keeping the final `canActivate`. */
function isPrincipalGuard(g: unknown): boolean {
  const proto: unknown = typeof g === 'function' ? g.prototype : g;
  return (
    proto instanceof PrincipalGuard &&
    proto.canActivate === PrincipalGuard.prototype.canActivate
  );
}

/**
 * Global default-deny guard (secure-by-default): a route is reachable only if
 * it is `@Public()` or guarded by a {@link PrincipalGuard} at route or
 * controller level. Anything else is rejected with 403.
 */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  /**
   * Injects the metadata reader.
   * @param reflector - reads route and controller metadata.
   */
  constructor(private readonly reflector: Reflector) {}

  /** Allows public or principal-guarded routes; denies everything else. */
  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    return this.reflector
      .getAllAndMerge<unknown[]>(GUARDS_METADATA, targets)
      .some(isPrincipalGuard);
  }
}
