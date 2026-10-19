import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { LoginRequest, StaffMe } from '@restaurant/shared';
import { Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { parseEnv } from '../common/env';
import { REDIS, type RedisClient } from '../common/redis.module';
import { Rooms, SocketServerRef } from '../common/socket-server.ref';
import {
  type AccessClaims,
  AuthTokens,
  REFRESH_TOKEN_MS,
} from './domain/auth-tokens';
import { PasswordHasher } from './ports/password-hasher';
import { StaffUserRepository } from './ports/staff-user-repository';

/** A freshly issued access and refresh token. */
export interface TokenPair {
  /** Access JWT (5 min). */
  access: string;
  /** Refresh JWT (1 h, single use). */
  refresh: string;
}

/** Redis key mapping a staff session id to its staff id. */
const sessionKey = (sid: string) => `auth:session:${sid}`;

/** Redis key mapping an unused refresh token id to its session id. */
const refreshKey = (jti: string) => `auth:refresh:${jti}`;

/** Key TTL: cleanup only; expiry is decided by the JWT `exp` against the Clock. */
const KEY_TTL = {
  expiration: { type: 'PX', value: REFRESH_TOKEN_MS },
} as const;

/** Thrown for any refresh failure. */
const unauthenticated = () =>
  new DomainError('UNAUTHENTICATED', 'Authentication required');

/**
 * Staff sessions. Sole owner of `auth:session:{sid}` → staffId and
 * `auth:refresh:{jti}` → sid; token strings are never stored or logged.
 */
@Injectable()
export class AuthSessionService implements OnModuleInit {
  /** JWT signing key. */
  private readonly secret = parseEnv().AUTH_JWT_SECRET;

  /** Hash verified for unknown emails, so they cost the same as a wrong password. */
  private dummyHash = '';

  /** Receives Redis, the staff store, the hasher, the clock and the socket server. */
  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    private readonly users: StaffUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly sockets: SocketServerRef,
  ) {}

  /** Computes the dummy hash with the real hasher's parameters. */
  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomUUID());
  }

  /**
   * Checks the credentials and opens a session. An unknown email and a wrong
   * password both throw the same `401 INVALID_CREDENTIALS`.
   */
  async login({
    email,
    password,
  }: LoginRequest): Promise<{ me: StaffMe; tokens: TokenPair }> {
    const user = await this.users.findByEmail(email);
    const ok = await this.hasher.verify(
      user?.passwordHash ?? this.dummyHash,
      password,
    );
    if (!user || !ok) {
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const sid = randomUUID();
    const jti = randomUUID();
    await this.redis
      .multi()
      .set(sessionKey(sid), user.id, KEY_TTL)
      .set(refreshKey(jti), sid, KEY_TTL)
      .exec();
    return {
      me: { id: user.id, email: user.email },
      tokens: this.issue(user.id, sid, jti),
    };
  }

  /**
   * Consumes a refresh token (single use, `GETDEL`) and returns a new pair
   * for the same session. A consumed or unknown `jti` only fails this call;
   * it does not end the session. Any failure throws `401 UNAUTHENTICATED`.
   */
  async refresh(token: string | undefined): Promise<TokenPair> {
    const claims = AuthTokens.verifyRefresh(
      token,
      this.secret,
      this.clock.now(),
    );
    if (!claims) throw unauthenticated();
    const sid = await this.redis.getDel(refreshKey(claims.jti));
    if (sid !== claims.sid) throw unauthenticated();
    const staffId = await this.redis.get(sessionKey(sid));
    if (staffId === null) throw unauthenticated();
    const jti = randomUUID();
    await this.redis
      .multi()
      .set(refreshKey(jti), sid, KEY_TTL)
      .pExpire(sessionKey(sid), REFRESH_TOKEN_MS)
      .exec();
    return this.issue(staffId, sid, jti);
  }

  /**
   * Ends session `sid` and, when `refreshToken` verifies for that session, its
   * refresh key; then disconnects the session's sockets.
   */
  async logout(sid: string, refreshToken: string | undefined): Promise<void> {
    const claims = AuthTokens.verifyRefresh(
      refreshToken,
      this.secret,
      this.clock.now(),
    );
    const keys = [sessionKey(sid)];
    if (claims?.sid === sid) keys.push(refreshKey(claims.jti));
    await this.redis.del(keys);
    this.sockets.server?.in(Rooms.staffSession(sid)).disconnectSockets();
  }

  /** Returns the claims of a valid access token whose session is live, or `null`. */
  async resolve(token: string | undefined): Promise<AccessClaims | null> {
    const claims = AuthTokens.verifyAccess(
      token,
      this.secret,
      this.clock.now(),
    );
    if (!claims) return null;
    const staffId = await this.redis.get(sessionKey(claims.sid));
    return staffId === claims.staffId ? claims : null;
  }

  /** Returns the staff user `staffId`; `401` when the account is gone. */
  async me(staffId: string): Promise<StaffMe> {
    const user = await this.users.findById(staffId);
    if (!user) throw unauthenticated();
    return { id: user.id, email: user.email };
  }

  /** Signs a new access and refresh token at the Clock's now. */
  private issue(staffId: string, sid: string, jti: string): TokenPair {
    const now = this.clock.now();
    return {
      access: AuthTokens.signAccess({ staffId, sid }, this.secret, now),
      refresh: AuthTokens.signRefresh({ sid, jti }, this.secret, now),
    };
  }
}
