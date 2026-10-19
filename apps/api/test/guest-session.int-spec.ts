import type { Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ErrorEnvelopeSchema,
  type GuestOrderView,
  GuestOrderViewSchema,
} from '@restaurant/shared';
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
import { Clock, FakeClock } from '../src/common/clock';
import { PrismaService } from '../src/common/prisma.module';
import { REDIS, type RedisClient } from '../src/common/redis.module';
import { configureApp } from '../src/configure-app';
import type { MenuItem } from '../src/generated/prisma/client';
import { GUEST_SESSION_MS } from '../src/orders/domain/guest-session-policy';
import { OrderRepository } from '../src/orders/ports/order-repository';
import { cookieHeader } from './cookies';
import { buildMenuItem } from './fixtures';

describe('Guest Session', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  const clock = new FakeClock(t0);
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let redis: RedisClient;
  let cola: MenuItem;

  /** Places an Order for `guestName`, replaying `cookie` when given. */
  const place = (cookie?: string, guestName = 'Ada') => {
    const req = request(app.getHttpServer()).post('/api/v1/orders');
    if (cookie) req.set('Cookie', cookie);
    return req.send({
      guestName,
      items: [{ menuItemId: cola.id, quantity: 1 }],
    });
  };

  /** Loads the current Order, replaying `cookie` when given. */
  const current = (cookie?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/orders/current');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  /** Places an Order and returns its view, cookie header and session id. */
  const placeOk = async (cookie?: string, guestName?: string) => {
    const res = await place(cookie, guestName);
    expect(res.status).toBe(201);
    const header = cookieHeader(res);
    return {
      view: GuestOrderViewSchema.parse(res.body),
      cookie: header,
      sid: header.replace('guest_session=', ''),
    };
  };

  /** Expects an error envelope with `status` and `code`. */
  const expectError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
  };

  /** Moves the clock to `ms` after `placedAt`. */
  const at = (view: GuestOrderView, ms: number) =>
    clock.set(new Date(new Date(view.placedAt).getTime() + ms));

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
  });

  beforeEach(async () => {
    clock.set(t0);
    cola = await buildMenuItem(prisma, { name: 'Cola', priceCents: 350 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sets the cookie and a Redis key expiring at placedAt + 24 h', async () => {
    const res = await place();

    expect(res.status).toBe(201);
    const setCookie = [res.headers['set-cookie'] ?? []].flat();
    expect(setCookie).toHaveLength(1);
    const [pair, ...attrs] = setCookie[0].split('; ');
    expect(pair).toMatch(/^guest_session=[0-9a-f]{32}$/);
    expect(attrs.sort()).toEqual(
      [
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Path=/',
        `Expires=${new Date(t0.getTime() + GUEST_SESSION_MS).toUTCString()}`,
      ].sort(),
    );

    const sid = pair.split('=')[1];
    const stored = await prisma.order.findFirstOrThrow();
    expect(await redis.get(`guest:session:${sid}`)).toBe(stored.id);
    const pttl = await redis.pTTL(`guest:session:${sid}`);
    expect(pttl).toBeGreaterThan(GUEST_SESSION_MS - 10_000);
    expect(pttl).toBeLessThanOrEqual(GUEST_SESSION_MS);
  });

  it('returns the session Order on /current', async () => {
    const { view, cookie } = await placeOk();
    const res = await current(cookie);

    expect(res.status).toBe(200);
    expect(GuestOrderViewSchema.parse(res.body)).toEqual(view);
    expect(res.body).not.toHaveProperty('id');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reads items sorted by position, not insertion order', async () => {
    const { id } = await prisma.order.create({
      data: {
        reference: 'SORT01',
        guestName: 'Ada',
        status: 'RECEIVED',
        totalCents: 0,
        placedAt: t0,
        items: {
          create: ['C', 'A', 'B'].map((name, i) => ({
            menuItemId: cola.id,
            name,
            quantity: 1,
            unitPriceCents: 0,
            position: [2, 0, 1][i],
          })),
        },
      },
    });

    const order = await app.get(OrderRepository).findById(id);
    expect(order?.items.map((i) => i.name)).toEqual(['A', 'B', 'C']);
  });

  it('returns items in basket order on /current', async () => {
    const pizza = await buildMenuItem(prisma, { name: 'Pizza' });
    const soup = await buildMenuItem(prisma, { name: 'Soup' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        guestName: 'Ada',
        items: [soup, cola, pizza].map((m) => ({
          menuItemId: m.id,
          quantity: 1,
        })),
      });

    const names = GuestOrderViewSchema.parse(
      (await current(cookieHeader(res))).body,
    ).items.map((i) => i.name);
    expect(names).toEqual(['Soup', 'Cola', 'Pizza']);
  });

  it.each([
    ['no cookie', undefined],
    ['an empty value', 'guest_session='],
    ['a malformed value', 'guest_session=not-a-session-id'],
    ['an upper-case sid', `guest_session=${'A'.repeat(32)}`],
  ])('rejects %s with 401 and no Redis call', async (_, cookie) => {
    const get = vi.spyOn(redis, 'get');
    const del = vi.spyOn(redis, 'del');
    expectError(await current(cookie), 401, 'UNAUTHENTICATED');
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('rejects an unknown well-formed sid with 401', async () => {
    expectError(
      await current(`guest_session=${'a'.repeat(32)}`),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('ends the session at exactly placedAt + 24 h and deletes the key', async () => {
    const { view, cookie, sid } = await placeOk();

    at(view, GUEST_SESSION_MS - 1);
    expect((await current(cookie)).status).toBe(200);

    at(view, GUEST_SESSION_MS);
    expectError(await current(cookie), 401, 'UNAUTHENTICATED');
    expect(await redis.exists(`guest:session:${sid}`)).toBe(0);
  });

  it('ends the session when the Order is Collected and deletes the key', async () => {
    const { view, cookie, sid } = await placeOk();
    await prisma.order.update({
      where: { reference: view.reference },
      data: { status: 'COLLECTED' },
    });

    expectError(await current(cookie), 401, 'UNAUTHENTICATED');
    expect(await redis.exists(`guest:session:${sid}`)).toBe(0);
  });

  it('rejects a second placement with 409 ORDER_ALREADY_OPEN', async () => {
    const { view, cookie } = await placeOk();
    const res = await place(cookie);

    expectError(res, 409, 'ORDER_ALREADY_OPEN');
    expect(ErrorEnvelopeSchema.parse(res.body).error.details).toEqual({
      reference: view.reference,
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
  });

  it.each([
    [
      'after 24 h',
      (view: GuestOrderView) => {
        at(view, GUEST_SESSION_MS);
        return Promise.resolve();
      },
    ],
    [
      'after Collected',
      async (view: GuestOrderView) => {
        await prisma.order.update({
          where: { reference: view.reference },
          data: { status: 'COLLECTED' },
        });
      },
    ],
  ])('allows a new placement %s with a new session', async (_, end) => {
    const first = await placeOk();
    await end(first.view);

    const second = await placeOk(first.cookie);

    expect(second.sid).not.toBe(first.sid);
    expect(second.view.reference).not.toBe(first.view.reference);
    const res = await current(second.cookie);
    expect(res.status).toBe(200);
    expect(GuestOrderViewSchema.parse(res.body)).toEqual(second.view);
    expect(await prisma.order.count()).toBe(2);
  });

  it('isolates guests: each /current returns only its own Order', async () => {
    const a = await placeOk(undefined, 'Ada');
    const b = await placeOk(undefined, 'Bob');

    expect(GuestOrderViewSchema.parse((await current(a.cookie)).body)).toEqual(
      a.view,
    );
    expect(GuestOrderViewSchema.parse((await current(b.cookie)).body)).toEqual(
      b.view,
    );
  });

  it('returns 500 INTERNAL when the session SET fails after the insert', async () => {
    const set = redis.set.bind(redis);
    vi.spyOn(redis, 'set').mockImplementation((key, ...rest) =>
      String(key).startsWith('guest:session:')
        ? Promise.reject(new Error('redis down'))
        : set(key, ...rest),
    );

    const res = await place();

    expectError(res, 500, 'INTERNAL');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
  });
});
