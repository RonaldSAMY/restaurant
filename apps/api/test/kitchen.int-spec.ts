import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ErrorEnvelopeSchema,
  GuestOrderViewSchema,
  KitchenOrderSchema,
  type OrderStatus,
} from '@restaurant/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthSessionService } from '../src/auth/auth-session.service';
import { PasswordHasher } from '../src/auth/ports/password-hasher';
import { Clock, FakeClock } from '../src/common/clock';
import { PrismaService } from '../src/common/prisma.module';
import { configureApp } from '../src/configure-app';
import type { MenuItem } from '../src/generated/prisma/client';
import { cookieHeader } from './cookies';
import { buildMenuItem, buildStaffUser } from './fixtures';

describe('Kitchen Orders', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  const clock = new FakeClock(t0);
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let cola: MenuItem;
  /** `Cookie` header of a logged-in staff user. */
  let staffCookie: string;

  const http = () => request(app.getHttpServer());

  /** Lists open Orders as `cookie` (staff by default). */
  const list = (cookie: string | null = staffCookie) => {
    const req = http().get('/api/v1/kitchen/orders');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  /** Sends `body` to the advance route for `id` as `cookie` (staff by default). */
  const advance = (
    id: string,
    body: object,
    cookie: string | null = staffCookie,
  ) => {
    const req = http().patch(`/api/v1/kitchen/orders/${id}/status`);
    if (cookie) req.set('Cookie', cookie);
    return req.send(body);
  };

  /** Places an Order as a Guest; returns its id and the guest cookie. */
  const place = async () => {
    const res = await http()
      .post('/api/v1/orders')
      .send({
        guestName: 'Ada',
        items: [{ menuItemId: cola.id, quantity: 2 }],
      });
    expect(res.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({
      where: { reference: GuestOrderViewSchema.parse(res.body).reference },
    });
    return { id: order.id, cookie: cookieHeader(res) };
  };

  /** Inserts an Order directly with `status`, `placedAt` and `[name, position]` items. */
  const insert = (
    reference: string,
    status: OrderStatus,
    placedAt: Date,
    items: [string, number][] = [['Cola', 0]],
    id?: string,
  ) =>
    prisma.order.create({
      data: {
        id,
        reference,
        guestName: 'Ada',
        status,
        totalCents: 350,
        placedAt,
        items: {
          create: items.map(([name, position]) => ({
            menuItemId: cola.id,
            name,
            quantity: 1,
            unitPriceCents: 350,
            position,
          })),
        },
      },
    });

  /** Current status of the Order with `id`. */
  const statusOf = async (id: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  /** Expects an error envelope with `status` and `code`. */
  const expectError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
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
  });

  beforeEach(async () => {
    clock.set(t0);
    cola = await buildMenuItem(prisma, { name: 'Cola', priceCents: 350 });
    const { user, password } = await buildStaffUser(
      prisma,
      app.get(PasswordHasher),
    );
    const { tokens } = await app
      .get(AuthSessionService)
      .login({ email: user.email, password });
    staffCookie = `access_token=${tokens.access}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists only open Orders, oldest first, with their id', async () => {
    const at = (s: number) => new Date(t0.getTime() + s * 1000);
    const ready = await insert('AAAAA1', 'READY', at(1));
    await insert('AAAAA2', 'COLLECTED', at(0));
    const received = await insert('AAAAA3', 'RECEIVED', at(0), [
      ['Cola', 1],
      ['Soup', 2],
      ['Pizza', 0],
    ]);

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const orders = KitchenOrderSchema.array().parse(res.body);
    expect(orders.map((o) => [o.id, o.status])).toEqual([
      [received.id, 'RECEIVED'],
      [ready.id, 'READY'],
    ]);
    expect(orders[0]).toEqual({
      id: received.id,
      reference: 'AAAAA3',
      guestName: 'Ada',
      status: 'RECEIVED',
      items: ['Pizza', 'Cola', 'Soup'].map((name) => ({
        name,
        quantity: 1,
        unitPriceCents: 350,
      })),
      totalCents: 350,
      placedAt: at(0).toISOString(),
    });
  });

  it('breaks placedAt ties by ascending id', async () => {
    // Larger id inserted first, so insertion order alone would fail this.
    const hi = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const lo = '00000000-0000-4000-8000-000000000000';
    await insert('CCCCC1', 'RECEIVED', t0, undefined, hi);
    await insert('CCCCC2', 'PREPARING', t0, undefined, lo);

    const res = await list();

    expect(res.status).toBe(200);
    expect(
      KitchenOrderSchema.array()
        .parse(res.body)
        .map((o) => o.id),
    ).toEqual([lo, hi]);
  });

  it('advances RECEIVED → PREPARING → READY → COLLECTED', async () => {
    const { id } = await place();
    for (const to of ['PREPARING', 'READY', 'COLLECTED'] as const) {
      const res = await advance(id, { to });
      expect(res.status).toBe(200);
      expect(KitchenOrderSchema.parse(res.body)).toMatchObject({
        id,
        status: to,
      });
      expect(await statusOf(id)).toBe(to);
    }
    expect((await list()).body).toEqual([]);
  });

  it.each([
    ['a skip', 'RECEIVED', 'READY'],
    ['a skip to Collected', 'RECEIVED', 'COLLECTED'],
    ['a backward move', 'READY', 'PREPARING'],
    ['a move to RECEIVED', 'PREPARING', 'RECEIVED'],
    ['a move from Collected', 'COLLECTED', 'READY'],
    ['Collected to RECEIVED', 'COLLECTED', 'RECEIVED'],
  ] as const)(
    'rejects %s (%s → %s) with 409 and leaves the Order unchanged',
    async (_, from, to) => {
      const { id } = await insert('BBBBB1', from, t0);
      expectError(await advance(id, { to }), 409, 'INVALID_TRANSITION');
      expect(await statusOf(id)).toBe(from);
    },
  );

  it('lets exactly one of two racing advances win', async () => {
    const { id } = await place();
    const results = await Promise.all([
      advance(id, { to: 'PREPARING' }),
      advance(id, { to: 'PREPARING' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expectError(
      results.find((r) => r.status === 409)!,
      409,
      'INVALID_TRANSITION',
    );
    expect(await statusOf(id)).toBe('PREPARING');
  });

  it.each([
    ['an unknown id', randomUUID(), 'PREPARING'],
    ['a malformed id', 'not-a-uuid', 'PREPARING'],
    ['an unknown id to RECEIVED', randomUUID(), 'RECEIVED'],
  ])('returns 404 ORDER_NOT_FOUND for %s', async (_, id, to) => {
    expectError(await advance(id, { to }), 404, 'ORDER_NOT_FOUND');
  });

  it.each([
    ['an unknown status', { to: 'DONE' }],
    ['a missing status', {}],
  ])('returns 400 VALIDATION_FAILED for %s', async (_, body) => {
    const { id } = await place();
    expectError(await advance(id, body), 400, 'VALIDATION_FAILED');
    expect(await statusOf(id)).toBe('RECEIVED');
  });

  it('ends the Guest Session when the Order is Collected', async () => {
    const { id, cookie } = await place();
    for (const to of ['PREPARING', 'READY', 'COLLECTED'] as const) {
      expect((await advance(id, { to })).status).toBe(200);
    }
    const res = await http()
      .get('/api/v1/orders/current')
      .set('Cookie', cookie);
    expectError(res, 401, 'UNAUTHENTICATED');
  });

  it('rejects anonymous and guest-only callers on both routes', async () => {
    const { id, cookie } = await place();
    for (const caller of [null, cookie]) {
      expectError(await list(caller), 401, 'UNAUTHENTICATED');
      expectError(
        await advance(id, { to: 'PREPARING' }, caller),
        401,
        'UNAUTHENTICATED',
      );
    }
    expect(await statusOf(id)).toBe('RECEIVED');
  });
});
