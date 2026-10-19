import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_MS, AuthTokens, REFRESH_TOKEN_MS } from './auth-tokens';

/** Signing key under test. */
const secret = 's'.repeat(32);
/** Signing time. */
const t0 = new Date('2026-10-19T12:34:56.789Z');
/** `ms` after {@link t0}. */
const at = (ms: number) => new Date(t0.getTime() + ms);
/** Access claims under test. */
const access = { staffId: randomUUID(), sid: randomUUID() };
/** Refresh claims under test. */
const refresh = { sid: randomUUID(), jti: randomUUID() };

describe('AuthTokens', () => {
  it('round-trips access claims until exactly now + 5 min', () => {
    const token = AuthTokens.signAccess(access, secret, t0);
    expect(
      AuthTokens.verifyAccess(token, secret, at(ACCESS_TOKEN_MS - 1)),
    ).toEqual(access);
    expect(
      AuthTokens.verifyAccess(token, secret, at(ACCESS_TOKEN_MS)),
    ).toBeNull();
  });

  it('round-trips refresh claims until exactly now + 1 h', () => {
    const token = AuthTokens.signRefresh(refresh, secret, t0);
    expect(
      AuthTokens.verifyRefresh(token, secret, at(REFRESH_TOKEN_MS - 1)),
    ).toEqual(refresh);
    expect(
      AuthTokens.verifyRefresh(token, secret, at(REFRESH_TOKEN_MS)),
    ).toBeNull();
  });

  it('sets aud, iat and exp from the given time', () => {
    const decoded = jwt.decode(AuthTokens.signAccess(access, secret, t0));
    expect(decoded).toMatchObject({
      aud: 'staff-access',
      iat: t0.getTime() / 1000,
      exp: (t0.getTime() + ACCESS_TOKEN_MS) / 1000,
    });
  });

  it('rejects a token of the other kind (aud)', () => {
    const r = AuthTokens.signRefresh(refresh, secret, t0);
    const a = AuthTokens.signAccess(access, secret, t0);
    expect(AuthTokens.verifyAccess(r, secret, t0)).toBeNull();
    expect(AuthTokens.verifyRefresh(a, secret, t0)).toBeNull();
  });

  it('rejects a wrong secret, a non-HS256 alg, garbage and no token', () => {
    const token = AuthTokens.signAccess(access, secret, t0);
    expect(AuthTokens.verifyAccess(token, 'x'.repeat(32), t0)).toBeNull();
    const hs512 = jwt.sign(
      { ...access, aud: 'staff-access', exp: t0.getTime() / 1000 + 60 },
      secret,
      { algorithm: 'HS512' },
    );
    expect(AuthTokens.verifyAccess(hs512, secret, t0)).toBeNull();
    const none = jwt.sign(
      { ...access, aud: 'staff-access', exp: t0.getTime() / 1000 + 60 },
      '',
      { algorithm: 'none' },
    );
    expect(AuthTokens.verifyAccess(none, secret, t0)).toBeNull();
    expect(AuthTokens.verifyAccess('not.a.jwt', secret, t0)).toBeNull();
    expect(AuthTokens.verifyAccess(undefined, secret, t0)).toBeNull();
  });

  it('rejects a valid signature with malformed claims', () => {
    const token = jwt.sign(
      {
        staffId: 'nope',
        sid: access.sid,
        aud: 'staff-access',
        exp: t0.getTime() / 1000 + 60,
      },
      secret,
      { algorithm: 'HS256' },
    );
    expect(AuthTokens.verifyAccess(token, secret, t0)).toBeNull();
  });
});
