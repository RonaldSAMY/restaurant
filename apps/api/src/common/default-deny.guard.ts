import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Marker base class for guards that establish a principal (staff or guest).
 * A route carrying a subclass via `@UseGuards` passes the default-deny check;
 * the subclass then decides access itself.
 */
export abstract class PrincipalGuard implements CanActivate {
  /** Returns whether the request carries a valid principal. */
  abstract canActivate(context: ExecutionContext): boolean | Promise<boolean>;
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
    const guards = this.reflector.getAllAndMerge<unknown[]>(
      GUARDS_METADATA,
      targets,
    );
    return guards.some(
      (g) =>
        (typeof g === 'function' && g.prototype instanceof PrincipalGuard) ||
        g instanceof PrincipalGuard,
    );
  }
}
