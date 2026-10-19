import type { Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ErrorEnvelopeSchema,
  type GuestOrderView,
  GuestOrderViewSchema,
} from '@restaurant/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { Clock, FakeClock } from '../src/common/clock';
import { PrismaService } from '../src/common/prisma.module';
import { configureApp } from '../src/configure-app';
import { GUEST_SESSION_MS } from '../src/orders/domain/guest-session-policy';
import { REFERENCE_LOOKUP_THROTTLE } from '../src/orders/orders.controller';
import { buildMenuItem } from './fixtures';

describe('Track by Order Reference', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  const clock = new FakeClock(t0);
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let placed: GuestOrderView;
  /** Client IP for this test (via `X-Forwarded-For`), so the throttle is per test. */
  let ip: string;
  /** Per-test counter that makes {@link ip} unique within the file. */
  let ipSeq = 0;

  /** Looks up `reference` anonymously from `from`. */
  const lookup = (reference: string, from = ip) =>
    request(app.getHttpServer())
      .get(`/api/v1/orders/by-reference/${encodeURIComponent(reference)}`)
      .set('X-Forwarded-For', from);

  /** Moves the clock to `ms` after the Order's `placedAt`. */
  const at = (ms: number) =>
    clock.set(new Date(new Date(placed.placedAt).getTime() + ms));

  /** Expects the one 404 body every not-found lookup returns. */
  const expectNotFound = (res: request.Response) => {
    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(res.body)).toEqual({
      error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
    });
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
    ip = `203.0.113.${++ipSeq}`;
    const cola = await buildMenuItem(prisma, { name: 'Cola', priceCents: 350 });
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        guestName: 'Ada',
        items: [{ menuItemId: cola.id, quantity: 2 }],
      });
    expect(res.status).toBe(201);
    placed = GuestOrderViewSchema.parse(res.body);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the Guest view in any letter case, with no cookie or id', async () => {
    const mixed = placed.reference
      .split('')
      .map((c, i) => (i % 2 ? c.toLowerCase() : c))
      .join('');

    for (const ref of [placed.reference.toLowerCase(), mixed]) {
      const res = await lookup(ref);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(placed);
      expect(res.body).not.toHaveProperty('id');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('still returns a Collected Order inside the 24 h window', async () => {
    await prisma.order.update({
      where: { reference: placed.reference },
      data: { status: 'COLLECTED' },
    });

    const res = await lookup(placed.reference);

    expect(res.status).toBe(200);
    expect(GuestOrderViewSchema.parse(res.body).status).toBe('COLLECTED');
  });

  it('returns 200 at placedAt + 24 h − 1 ms and 404 at exactly + 24 h', async () => {
    at(GUEST_SESSION_MS - 1);
    expect((await lookup(placed.reference)).status).toBe(200);

    at(GUEST_SESSION_MS);
    expectNotFound(await lookup(placed.reference));
  });

  it('returns identical 404s for unknown, malformed and expired references', async () => {
    const unknown = placed.reference === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    const unknownRes = await lookup(unknown);
    const malformedRes = await lookup('abc-12');
    at(GUEST_SESSION_MS);
    const expiredRes = await lookup(placed.reference);

    for (const res of [unknownRes, malformedRes, expiredRes]) {
      expectNotFound(res);
    }
    expect(expiredRes.body).toEqual(unknownRes.body);
    // NFR2: expiry limits Guest access only; the Order stays stored.
    await expect(
      prisma.order.count({ where: { reference: placed.reference } }),
    ).resolves.toBe(1);
  });

  it('throttles lookups per client IP with 429 RATE_LIMITED, failures included', async () => {
    const { limit } = REFERENCE_LOOKUP_THROTTLE.default;
    // Guessing is what the throttle stops: unknown and malformed lookups count.
    for (let i = 0; i < limit; i++) {
      expect((await lookup(i % 2 ? 'abc-12' : 'ZZZZZZ')).status).toBe(404);
    }

    const limited = await lookup(placed.reference);
    expect(limited.status).toBe(429);
    expect(ErrorEnvelopeSchema.parse(limited.body).error.code).toBe(
      'RATE_LIMITED',
    );
    // trust proxy: another client behind the same proxy is not limited.
    expect((await lookup(placed.reference, '198.51.100.7')).status).toBe(200);
  });
});
