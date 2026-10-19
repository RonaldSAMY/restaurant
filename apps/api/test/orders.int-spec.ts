import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema, GuestOrderViewSchema } from '@restaurant/shared';
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
import { configureApp } from '../src/configure-app';
import type { MenuItem } from '../src/generated/prisma/client';
import { OrderReference } from '../src/orders/domain/order-reference';
import { buildMenuItem } from './fixtures';

describe('POST /api/v1/orders', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let pizza: MenuItem;
  let cola: MenuItem;

  /** Places an Order anonymously. */
  const place = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/orders').send(body);

  /** Expects a 4xx envelope with `code` and no stored Order. */
  const expectRejected = async (
    res: request.Response,
    status: number,
    code: string,
  ) => {
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
    expect(await prisma.order.count()).toBe(0);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new FakeClock(t0))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    pizza = await buildMenuItem(prisma, { name: 'Pizza', priceCents: 1200 });
    cola = await buildMenuItem(prisma, { name: 'Cola', priceCents: 350 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('places an Order with server prices and returns the Guest view', async () => {
    const logged = vi.spyOn(Logger.prototype, 'log');
    const res = await place({
      guestName: '  Ada  ',
      items: [
        { menuItemId: pizza.id, quantity: 2, priceCents: 1 },
        { menuItemId: cola.id, quantity: 1 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('id');
    const view = GuestOrderViewSchema.parse(res.body);
    expect(view).toEqual({
      reference: expect.stringMatching(/^[A-Z0-9]{6}$/) as string,
      guestName: 'Ada',
      status: 'RECEIVED',
      items: [
        { name: 'Pizza', quantity: 2, unitPriceCents: 1200 },
        { name: 'Cola', quantity: 1, unitPriceCents: 350 },
      ],
      totalCents: 2750,
      placedAt: t0.toISOString(),
    });
    const placedLogs = logged.mock.calls
      .map((args) => JSON.stringify(args))
      .filter((line) => line.includes('Order placed'));
    expect(placedLogs).toHaveLength(1);
    expect(placedLogs[0]).toContain(view.reference);
    expect(placedLogs[0]).not.toContain('Ada');

    const stored = await prisma.order.findUniqueOrThrow({
      where: { reference: view.reference },
      include: { items: true },
    });
    expect(stored).toMatchObject({
      guestName: 'Ada',
      status: 'RECEIVED',
      totalCents: 2750,
      placedAt: t0,
    });
    expect(
      stored.items.map(({ menuItemId, name, quantity, unitPriceCents }) => ({
        menuItemId,
        name,
        quantity,
        unitPriceCents,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          menuItemId: pizza.id,
          name: 'Pizza',
          quantity: 2,
          unitPriceCents: 1200,
        },
        { menuItemId: cola.id, name: 'Cola', quantity: 1, unitPriceCents: 350 },
      ]),
    );
    expect(stored.items).toHaveLength(2);
  });

  it('merges duplicate lines in order of first appearance', async () => {
    const res = await place({
      guestName: 'Ada',
      items: [
        { menuItemId: pizza.id, quantity: 2 },
        { menuItemId: cola.id, quantity: 1 },
        { menuItemId: pizza.id, quantity: 3 },
      ],
    });

    expect(res.status).toBe(201);
    expect(GuestOrderViewSchema.parse(res.body).items).toEqual([
      { name: 'Pizza', quantity: 5, unitPriceCents: 1200 },
      { name: 'Cola', quantity: 1, unitPriceCents: 350 },
    ]);
    expect(await prisma.orderItem.count()).toBe(2);
  });

  it('rejects merged duplicates over 99 with 400 VALIDATION_FAILED', async () => {
    const res = await place({
      guestName: 'Ada',
      items: [
        { menuItemId: pizza.id, quantity: 60 },
        { menuItemId: pizza.id, quantity: 60 },
      ],
    });
    await expectRejected(res, 400, 'VALIDATION_FAILED');
  });

  it.each([
    ['an empty basket', { guestName: 'Ada', items: [] }],
    ['quantity 0', { guestName: 'Ada', items: [{ quantity: 0 }] }],
    ['quantity 1.5', { guestName: 'Ada', items: [{ quantity: 1.5 }] }],
    ['a blank name', { guestName: '  ', items: [{ quantity: 1 }] }],
    ['a 61-char name', { guestName: 'a'.repeat(61), items: [{ quantity: 1 }] }],
    [
      '51 item lines',
      {
        guestName: 'Ada',
        items: Array.from({ length: 51 }, () => ({ quantity: 1 })),
      },
    ],
    ['quantity 100', { guestName: 'Ada', items: [{ quantity: 100 }] }],
    [
      'a non-UUID menuItemId',
      { guestName: 'Ada', items: [{ quantity: 1, menuItemId: 'not-a-uuid' }] },
    ],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_, body) => {
    const items = body.items.map((i) => ({ menuItemId: pizza.id, ...i }));
    await expectRejected(
      await place({ ...body, items }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rejects an unknown Menu Item with 400 MENU_ITEM_NOT_FOUND', async () => {
    const res = await place({
      guestName: 'Ada',
      items: [
        { menuItemId: pizza.id, quantity: 1 },
        { menuItemId: randomUUID(), quantity: 1 },
      ],
    });
    await expectRejected(res, 400, 'MENU_ITEM_NOT_FOUND');
  });

  it('accepts the same guest name twice with different references', async () => {
    const body = {
      guestName: 'Ada',
      items: [{ menuItemId: cola.id, quantity: 1 }],
    };
    const first = await place(body);
    const second = await place(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(GuestOrderViewSchema.parse(second.body).reference).not.toBe(
      GuestOrderViewSchema.parse(first.body).reference,
    );
    expect(await prisma.order.count()).toBe(2);
  });

  it('retries a reference collision with a new reference', async () => {
    const body = {
      guestName: 'Ada',
      items: [{ menuItemId: cola.id, quantity: 1 }],
    };
    const taken = GuestOrderViewSchema.parse(
      (await place(body)).body,
    ).reference;
    const generate = vi
      .spyOn(OrderReference, 'generate')
      .mockReturnValueOnce(taken);

    const res = await place(body);

    expect(res.status).toBe(201);
    expect(GuestOrderViewSchema.parse(res.body).reference).not.toBe(taken);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await prisma.order.count()).toBe(2);
  });

  it('gives up after 5 collisions with 500 INTERNAL and logs no values', async () => {
    const body = {
      guestName: 'secret-guest-marker',
      items: [{ menuItemId: cola.id, quantity: 1 }],
    };
    const taken = GuestOrderViewSchema.parse(
      (await place(body)).body,
    ).reference;
    const generate = vi
      .spyOn(OrderReference, 'generate')
      .mockReturnValue(taken);
    const logged = vi.spyOn(Logger.prototype, 'error');

    const res = await place(body);

    expect(res.status).toBe(500);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('INTERNAL');
    expect(generate).toHaveBeenCalledTimes(5);
    expect(await prisma.order.count()).toBe(1);
    expect(logged).toHaveBeenCalledOnce();
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain('P2002');
    expect(output).not.toContain(taken);
    expect(output).not.toContain('secret-guest-marker');
  });

  it('enforces non-negative prices on MenuItem in the database', async () => {
    await expect(buildMenuItem(prisma, { priceCents: -1 })).rejects.toThrow();
  });

  it.each([
    ['Order_totalCents_check', { totalCents: -1 }, {}],
    ['OrderItem_quantity_check', {}, { quantity: 0 }],
    ['OrderItem_unitPriceCents_check', {}, { unitPriceCents: -1 }],
  ])('enforces %s in the database', async (constraint, order, item) => {
    const create = prisma.order.create({
      data: {
        reference: 'CHECK1',
        guestName: 'Ada',
        status: 'RECEIVED',
        totalCents: 0,
        placedAt: t0,
        ...order,
        items: {
          create: {
            menuItemId: cola.id,
            name: 'Cola',
            quantity: 1,
            unitPriceCents: 0,
            ...item,
          },
        },
      },
    });
    await expect(create).rejects.toThrow(constraint);
    expect(await prisma.order.count()).toBe(0);
  });
});
