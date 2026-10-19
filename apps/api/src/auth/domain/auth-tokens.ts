import jwt from 'jsonwebtoken';
import { z } from 'zod';

/** Lifetime of a staff access token: 5 min. */
export const ACCESS_TOKEN_MS = 5 * 60 * 1000;

/** Lifetime of a staff refresh token (and the idle limit): 1 h. */
export const REFRESH_TOKEN_MS = 60 * 60 * 1000;

/** `aud` of access tokens; one secret signs both kinds, `aud` separates them. */
const ACCESS_AUD = 'staff-access';

/** `aud` of refresh tokens. */
const REFRESH_AUD = 'staff-refresh';

/** Claims of an access token. */
const AccessClaimsSchema = z.object({ staffId: z.uuid(), sid: z.uuid() });

/** Claims of a refresh token. */
const RefreshClaimsSchema = z.object({ sid: z.uuid(), jti: z.uuid() });

/** Identity carried by an access token. */
export type AccessClaims = z.infer<typeof AccessClaimsSchema>;

/** Session and single-use id carried by a refresh token. */
export type RefreshClaims = z.infer<typeof RefreshClaimsSchema>;

/** Epoch seconds, kept fractional so expiry is exact to the millisecond. */
const seconds = (ms: number) => ms / 1000;

/** Signs `claims` as an HS256 JWT for `aud`, valid from `now` for `ttlMs`. */
function sign(
  claims: object,
  aud: string,
  ttlMs: number,
  secret: string,
  now: Date,
): string {
  const t = now.getTime();
  return jwt.sign(
    { ...claims, aud, iat: seconds(t), exp: seconds(t + ttlMs) },
    secret,
    { algorithm: 'HS256' },
  );
}

/**
 * Verifies `token` (HS256 only, audience `aud`, expiry against `now`) and
 * parses its claims with `schema`. Returns `null` on any failure.
 */
function verify<T>(
  token: string | undefined,
  aud: string,
  schema: z.ZodType<T>,
  secret: string,
  now: Date,
): T | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: aud,
      clockTimestamp: seconds(now.getTime()),
    });
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Staff token rules (pure): build and check access and refresh JWTs. */
export const AuthTokens = {
  /** Signs an access token for `claims`, expiring `now` + 5 min. */
  signAccess(claims: AccessClaims, secret: string, now: Date): string {
    return sign(claims, ACCESS_AUD, ACCESS_TOKEN_MS, secret, now);
  },

  /** Signs a refresh token for `claims`, expiring `now` + 1 h. */
  signRefresh(claims: RefreshClaims, secret: string, now: Date): string {
    return sign(claims, REFRESH_AUD, REFRESH_TOKEN_MS, secret, now);
  },

  /** Returns the claims of a valid access token, or `null`. */
  verifyAccess(
    token: string | undefined,
    secret: string,
    now: Date,
  ): AccessClaims | null {
    return verify(token, ACCESS_AUD, AccessClaimsSchema, secret, now);
  },

  /** Returns the claims of a valid refresh token, or `null`. */
  verifyRefresh(
    token: string | undefined,
    secret: string,
    now: Date,
  ): RefreshClaims | null {
    return verify(token, REFRESH_AUD, RefreshClaimsSchema, secret, now);
  },
};
