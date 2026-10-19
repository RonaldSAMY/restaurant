import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema, StaffMeSchema } from '@restaurant/shared';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module';
import {
  ACCESS_TOKEN_MS,
  AuthTokens,
  REFRESH_TOKEN_MS,
} from '../src/auth/domain/auth-tokens';
import { PasswordHasher } from '../src/auth/ports/password-hasher';
import { Clock, FakeClock } from '../src/common/clock';
import { PrismaService } from '../src/common/prisma.module';
import { REDIS, type RedisClient } from '../src/common/redis.module';
import { configureApp } from '../src/configure-app';
import { seedStaff } from '../src/seed/seed.module';
import { type CookieSource } from './cookies';
import { buildMenuItem, buildStaffUser } from './fixtures';

/** One parsed `Set-Cookie`. */
interface SetCookie {
  /** Cookie value (`""` when cleared). */
  value: string;
  /** Attributes (`Path=/`, `HttpOnly`, ...), sorted. */
  attrs: string[];
}

/** Parses a response's `Set-Cookie` headers by cookie name. */
function setCookies(res: CookieSource): Record<string, SetCookie> {
  const raw = [res.headers['set-cookie'] ?? []].flat();
  return Object.fromEntries(
    raw.map((c) => {
      const [pair, ...attrs] = c.split('; ');
      const eq = pair.indexOf('=');
      return [
        pair.slice(0, eq),
        { value: pair.slice(eq + 1), attrs: attrs.sort() },
      ];
    }),
  );
}

/** Expected attributes of a set auth cookie on `path`. */
const attrs = (path: string) =>
  ['HttpOnly', 'Secure', 'SameSite=Strict', `Path=${path}`].sort();

describe('Staff auth', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  const clock = new FakeClock(t0);
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let redis: RedisClient;
  let hasher: PasswordHasher;
  let staff: { id: string; email: string; password: string };
  /** Client IP for this test (via `X-Forwarded-For`), so the login throttle is per test. */
  let ip: string;
  /** Per-test counter that makes {@link ip} unique within the file. */
  let ipSeq = 0;

  const http = () => request(app.getHttpServer());

  /** Posts a login body from the test's client IP. */
  const login = (body: object, from = ip) =>
    http().post('/api/v1/auth/login').set('X-Forwarded-For', from).send(body);

  /** Logs in as the fixture staff user and returns both token values. */
  const loginOk = async () => {
    const res = await login({ email: staff.email, password: staff.password });
    expect(res.status).toBe(200);
    const c = setCookies(res);
    return { access: c.access_token.value, refresh: c.refresh_token.value };
  };

  const me = (access?: string) => {
    const req = http().get('/api/v1/auth/me');
    return access ? req.set('Cookie', `access_token=${access}`) : req;
  };

  const refresh = (token?: string) => {
    const req = http().post('/api/v1/auth/refresh');
    return token ? req.set('Cookie', `refresh_token=${token}`) : req;
  };

  const logout = (cookie?: string) => {
    const req = http().post('/api/v1/auth/logout');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  /** Expects an error envelope with `status` and `code`. */
  const expectError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
  };

  /** The `sid` and `jti` inside a refresh token issued by the app. */
  const refreshClaims = (token: string) => {
    const claims = AuthTokens.verifyRefresh(
      token,
      process.env.AUTH_JWT_SECRET!,
      clock.now(),
    );
    if (!claims) throw new Error('not a valid refresh token');
    return claims;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    hasher = app.get(PasswordHasher);
  });

  beforeEach(async () => {
    clock.set(t0);
    ipSeq++;
    ip = `10.0.${ipSeq >> 8}.${ipSeq & 255}`;
    const { user, password } = await buildStaffUser(prisma, hasher);
    staff = { id: user.id, email: user.email, password };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('logs in with a mixed-case email, sets both cookies and stores only ids', async () => {
    const res = await login({
      email: '  Chef@Example.COM ',
      password: staff.password,
    });

    expect(res.status).toBe(200);
    expect(StaffMeSchema.strict().parse(res.body)).toEqual({
      id: staff.id,
      email: staff.email,
    });
    const c = setCookies(res);
    expect(Object.keys(c).sort()).toEqual(['access_token', 'refresh_token']);
    expect(c.access_token.attrs).toEqual(attrs('/'));
    expect(c.refresh_token.attrs).toEqual(attrs('/api/v1/auth'));

    const { sid, jti } = refreshClaims(c.refresh_token.value);
    const keys = (await redis.keys('auth:*')).sort();
    expect(keys).toEqual([`auth:refresh:${jti}`, `auth:session:${sid}`].sort());
    expect(await redis.get(`auth:session:${sid}`)).toBe(staff.id);
    expect(await redis.get(`auth:refresh:${jti}`)).toBe(sid);
    const pttl = await redis.pTTL(`auth:session:${sid}`);
    expect(pttl).toBeGreaterThan(REFRESH_TOKEN_MS - 10_000);
    expect(pttl).toBeLessThanOrEqual(REFRESH_TOKEN_MS);
  });

  it('returns the identical 401 for a wrong password and an unknown email, verifying a hash both times', async () => {
    const verify = vi.spyOn(hasher, 'verify');
    const wrong = await login({ email: staff.email, password: 'wrong-pass' });
    const unknown = await login({
      email: 'nobody@example.com',
      password: staff.password,
    });

    expectError(wrong, 401, 'INVALID_CREDENTIALS');
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1][0]).toMatch(/^\$argon2id\$/);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(unknown.headers['set-cookie']).toBeUndefined();
    expect(await redis.keys('auth:*')).toEqual([]);
  });

  it.each([
    ['a missing email', { password: 'x' }],
    ['a malformed email', { email: 'chef', password: 'x' }],
    ['an empty password', { email: 'chef@example.com', password: '' }],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_, body) => {
    expectError(await login(body), 400, 'VALIDATION_FAILED');
  });

  it('returns the staff user on /me', async () => {
    const { access } = await loginOk();
    const res = await me(access);

    expect(res.status).toBe(200);
    expect(StaffMeSchema.parse(res.body)).toEqual({
      id: staff.id,
      email: staff.email,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  describe('rejects with 401 UNAUTHENTICATED', () => {
    it.each([
      ['no cookie', () => Promise.resolve(undefined)],
      [
        'a forged signature',
        async () => {
          const { refresh: r } = await loginOk();
          return AuthTokens.signAccess(
            { staffId: staff.id, sid: refreshClaims(r).sid },
            'f'.repeat(32),
            clock.now(),
          );
        },
      ],
      [
        'a refresh token used as access token',
        async () => (await loginOk()).refresh,
      ],
    ])('/me with %s', async (_, token) => {
      expectError(await me(await token()), 401, 'UNAUTHENTICATED');
    });

    it('/me and /logout with only a guest_session cookie', async () => {
      const item = await buildMenuItem(prisma);
      const placed = await http()
        .post('/api/v1/orders')
        .send({
          guestName: 'Ada',
          items: [{ menuItemId: item.id, quantity: 1 }],
        });
      expect(placed.status).toBe(201);
      const guest = `guest_session=${setCookies(placed).guest_session.value}`;

      expectError(
        await http().get('/api/v1/auth/me').set('Cookie', guest),
        401,
        'UNAUTHENTICATED',
      );
      expectError(await logout(guest), 401, 'UNAUTHENTICATED');
    });

    it('/logout with no cookie', async () => {
      expectError(await logout(), 401, 'UNAUTHENTICATED');
    });

    it('/me when the access token is valid but its session is gone', async () => {
      const { access, refresh: r } = await loginOk();
      await redis.del(`auth:session:${refreshClaims(r).sid}`);
      expectError(await me(access), 401, 'UNAUTHENTICATED');
    });

    it.each([
      ['no cookie', undefined],
      ['garbage', 'not-a-jwt'],
    ])('/refresh with %s', async (_, token) => {
      expectError(await refresh(token), 401, 'UNAUTHENTICATED');
    });

    it('/refresh when the session is gone but the refresh key remains', async () => {
      const { refresh: r } = await loginOk();
      await redis.del(`auth:session:${refreshClaims(r).sid}`);
      const res = await refresh(r);
      expectError(res, 401, 'UNAUTHENTICATED');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('/refresh with an access token', async () => {
      const { access } = await loginOk();
      expectError(await refresh(access), 401, 'UNAUTHENTICATED');
    });
  });

  it('expires the access token at exactly 5 min', async () => {
    const { access } = await loginOk();

    clock.set(new Date(t0.getTime() + ACCESS_TOKEN_MS - 1));
    expect((await me(access)).status).toBe(200);

    clock.set(new Date(t0.getTime() + ACCESS_TOKEN_MS));
    expectError(await me(access), 401, 'UNAUTHENTICATED');
  });

  it('rotates: 204 with a new pair for the same session', async () => {
    const old = await loginOk();
    const sessionKey = `auth:session:${refreshClaims(old.refresh).sid}`;
    await redis.pExpire(sessionKey, 1000);
    clock.advance(ACCESS_TOKEN_MS);
    expect((await me(old.access)).status).toBe(401);

    const res = await refresh(old.refresh);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const c = setCookies(res);
    expect(c.access_token.attrs).toEqual(attrs('/'));
    expect(c.refresh_token.attrs).toEqual(attrs('/api/v1/auth'));
    expect(c.refresh_token.value).not.toBe(old.refresh);
    const before = refreshClaims(old.refresh);
    const after = refreshClaims(c.refresh_token.value);
    expect(after.sid).toBe(before.sid);
    expect(after.jti).not.toBe(before.jti);
    expect(await redis.exists(`auth:refresh:${before.jti}`)).toBe(0);
    expect(await redis.get(`auth:refresh:${after.jti}`)).toBe(after.sid);
    expect(await redis.pTTL(sessionKey)).toBeGreaterThan(
      REFRESH_TOKEN_MS - 10_000,
    );

    expect((await me(c.access_token.value)).status).toBe(200);
  });

  it('rejects a replayed refresh token without ending the session', async () => {
    const old = await loginOk();
    const rotated = setCookies(await refresh(old.refresh));

    expectError(await refresh(old.refresh), 401, 'UNAUTHENTICATED');

    expect((await me(rotated.access_token.value)).status).toBe(200);
    expect((await refresh(rotated.refresh_token.value)).status).toBe(204);
  });

  it('keeps an active session alive past 1 h by refreshing', async () => {
    let { refresh: r } = await loginOk();
    for (let i = 0; i < 3; i++) {
      clock.advance(REFRESH_TOKEN_MS - 1);
      const res = await refresh(r);
      expect(res.status).toBe(204);
      r = setCookies(res).refresh_token.value;
    }
  });

  it('rejects refresh after 1 h idle', async () => {
    const { refresh: r } = await loginOk();

    clock.set(new Date(t0.getTime() + REFRESH_TOKEN_MS));
    expectError(await refresh(r), 401, 'UNAUTHENTICATED');
  });

  it("logout keeps another session's refresh key", async () => {
    const a = await loginOk();
    const b = await loginOk();
    const { jti } = refreshClaims(b.refresh);

    const res = await logout(
      `access_token=${a.access}; refresh_token=${b.refresh}`,
    );

    expect(res.status).toBe(204);
    expect(await redis.get(`auth:refresh:${jti}`)).toBe(
      refreshClaims(b.refresh).sid,
    );
    expect((await refresh(b.refresh)).status).toBe(204);
  });

  it('logs out: 204, clears both cookies, deletes both keys, revokes both tokens', async () => {
    const { access, refresh: r } = await loginOk();
    const { sid, jti } = refreshClaims(r);

    const res = await logout(`access_token=${access}; refresh_token=${r}`);

    expect(res.status).toBe(204);
    const c = setCookies(res);
    const cleared = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    expect(c.access_token).toEqual({
      value: '',
      attrs: [...attrs('/'), cleared].sort(),
    });
    expect(c.refresh_token).toEqual({
      value: '',
      attrs: [...attrs('/api/v1/auth'), cleared].sort(),
    });
    expect(
      await redis.exists([`auth:session:${sid}`, `auth:refresh:${jti}`]),
    ).toBe(0);

    expectError(await me(access), 401, 'UNAUTHENTICATED');
    expectError(await refresh(r), 401, 'UNAUTHENTICATED');
  });

  it('throttles login to 5 per 60 s per client IP (6th is 429 even with correct creds)', async () => {
    const creds = { email: staff.email, password: staff.password };
    for (let i = 0; i < 5; i++) {
      expect((await login({ ...creds, password: 'wrong-pass' })).status).toBe(
        401,
      );
    }

    expectError(await login(creds), 429, 'RATE_LIMITED');
    expect((await login(creds, '192.0.2.77')).status).toBe(200);
  });

  it('seeds the staff user idempotently with an argon2id hash', async () => {
    const email = `  Seed-${randomUUID()}@Example.com `;
    await seedStaff(prisma, hasher, email, 'first-password-123');
    await seedStaff(prisma, hasher, email, 'second-password-123');

    const rows = await prisma.staffUser.findMany({
      where: { email: email.trim().toLowerCase() },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(await prisma.staffUser.count()).toBe(2);
    expect(
      (await login({ email, password: 'second-password-123' })).status,
    ).toBe(200);
  });
});
