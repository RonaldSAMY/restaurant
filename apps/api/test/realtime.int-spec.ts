import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { SubscribeMessage } from '@nestjs/websockets';
import { Test } from '@nestjs/testing';
import {
  GuestOrderViewSchema,
  GuestStatusChangedSchema,
  KitchenOrderSchema,
  KitchenStatusChangedSchema,
  SOCKET_PATH,
  SubscribeAckSchema,
} from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthSessionService } from '../src/auth/auth-session.service';
import { PasswordHasher } from '../src/auth/ports/password-hasher';
import { Clock, FakeClock } from '../src/common/clock';
import { PrismaService } from '../src/common/prisma.module';
import { configureApp } from '../src/configure-app';
import type { MenuItem } from '../src/generated/prisma/client';
import { Gateway } from '../src/realtime/realtime.gateway';
import { cookieHeader } from './cookies';
import { buildMenuItem, buildStaffUser } from './fixtures';

/** A gateway with one undecorated handler: default deny must refuse it. */
@Gateway()
class ProbeGateway {
  /** Neither `@Public()` nor principal-guarded. */
  @SubscribeMessage('probe.ping')
  ping(): string {
    return 'pong';
  }
}

describe('Realtime gateway', () => {
  const t0 = new Date('2026-10-19T12:34:56.789Z');
  const clock = new FakeClock(t0);
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let url: string;
  let cola: MenuItem;
  /** Cookie header of a logged-in staff user. */
  let staff: { cookie: string };
  /** Sockets opened by the current test, closed after it. */
  let sockets: Socket[] = [];

  const http = () => request(app.getHttpServer());

  /** Opens a socket; resolves on `connect`, rejects with the `connect_error`. */
  const connect = ({
    cookie,
    staff: isStaff = false,
    forwardedFor,
  }: { cookie?: string; staff?: boolean; forwardedFor?: string } = {}) => {
    const extraHeaders: Record<string, string> = {};
    if (cookie) extraHeaders.cookie = cookie;
    if (forwardedFor) extraHeaders['x-forwarded-for'] = forwardedFor;
    const socket = io(url, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders,
      auth: isStaff ? { staff: true } : {},
    });
    sockets.push(socket);
    return new Promise<Socket>((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  };

  /** Resolves with the next payload of `event` on `socket`. */
  const next = (socket: Socket, event: string) =>
    new Promise<unknown>((resolve) => socket.once(event, resolve));

  /** Records every event `socket` receives. */
  const record = (socket: Socket) => {
    const events: [string, unknown][] = [];
    socket.onAny((event: string, payload: unknown) =>
      events.push([event, payload]),
    );
    return events;
  };

  /** Emits `event` with `body` and resolves with the parsed ack. */
  const ask = async (socket: Socket, event: string, body: unknown) =>
    SubscribeAckSchema.parse(
      await socket.timeout(5000).emitWithAck(event, body),
    );

  /** Error code of an ack, or `ok`. */
  const codeOf = (ack: { ok: true } | { error: { code: string } }) =>
    'error' in ack ? ack.error.code : 'ok';

  /** Places an Order as a Guest; returns its reference, id and the guest cookie. */
  const place = async () => {
    const res = await http()
      .post('/api/v1/orders')
      .send({
        guestName: 'Ada',
        items: [{ menuItemId: cola.id, quantity: 1 }],
      });
    expect(res.status).toBe(201);
    const { reference } = GuestOrderViewSchema.parse(res.body);
    const { id } = await prisma.order.findUniqueOrThrow({
      where: { reference },
    });
    return { reference, id, cookie: cookieHeader(res) };
  };

  /** Advances Order `id` to `to` as staff; returns the HTTP status. */
  const advance = async (id: string, to: string) =>
    (
      await http()
        .patch(`/api/v1/kitchen/orders/${id}/status`)
        .set('Cookie', staff.cookie)
        .send({ to })
    ).status;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [ProbeGateway],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
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
    staff = { cookie: `access_token=${tokens.access}` };
  });

  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets = [];
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sends order.created and kitchen status changes to staff', async () => {
    const board = await connect({ cookie: staff.cookie, staff: true });
    const created = next(board, 'order.created');
    const { id, reference } = await place();
    expect(KitchenOrderSchema.parse(await created)).toMatchObject({
      id,
      reference,
      status: 'RECEIVED',
    });

    const changed = next(board, 'order.status-changed');
    expect(await advance(id, 'PREPARING')).toBe(200);
    expect(KitchenStatusChangedSchema.strict().parse(await changed)).toEqual({
      id,
      reference,
      status: 'PREPARING',
      changedAt: t0.toISOString(),
    });
  });

  it.each([
    ['no access cookie', () => undefined],
    ['an expired access cookie', () => staff.cookie],
  ])('refuses a staff handshake with %s', async (name, cookie) => {
    if (name.includes('expired')) clock.advance(5 * 60_000 + 1000);
    await expect(connect({ cookie: cookie(), staff: true })).rejects.toThrow(
      'UNAUTHENTICATED',
    );
  });

  it('sends a Guest its status changes without the Order id', async () => {
    const { id, reference, cookie } = await place();
    const guest = await connect({ cookie });
    const changed = next(guest, 'order.status-changed');
    expect(await advance(id, 'PREPARING')).toBe(200);
    expect(GuestStatusChangedSchema.strict().parse(await changed)).toEqual({
      reference,
      status: 'PREPARING',
      changedAt: t0.toISOString(),
    });
  });

  it('connects an anonymous client into no room', async () => {
    const anon = await connect();
    const events = record(anon);
    const { id } = await place();
    expect(await advance(id, 'PREPARING')).toBe(200);
    // The ack is emitted after both events, and one socket keeps order.
    await ask(anon, 'order.subscribe', {});
    expect(events).toEqual([]);
  });

  it('subscribes by reference in any case, then sends events', async () => {
    const { id, reference } = await place();
    const anon = await connect();
    expect(
      await ask(anon, 'order.subscribe', {
        reference: reference.toLowerCase(),
      }),
    ).toEqual({ ok: true });
    const changed = next(anon, 'order.status-changed');
    expect(await advance(id, 'PREPARING')).toBe(200);
    expect(
      GuestStatusChangedSchema.strict().parse(await changed),
    ).toMatchObject({ reference, status: 'PREPARING' });
  });

  it('acks ORDER_NOT_FOUND or VALIDATION_FAILED for a bad subscribe', async () => {
    const { reference } = await place();
    const anon = await connect();
    const sub = async (body: unknown) =>
      codeOf(await ask(anon, 'order.subscribe', body));
    expect(await sub({ reference: 'ZZZZZ9' })).toBe('ORDER_NOT_FOUND');
    expect(await sub({ reference: 'not a ref' })).toBe('ORDER_NOT_FOUND');
    expect(await sub({ reference: 42 })).toBe('VALIDATION_FAILED');
    expect(await sub(undefined)).toBe('VALIDATION_FAILED');
    clock.advance(24 * 60 * 60_000);
    expect(await sub({ reference })).toBe('ORDER_NOT_FOUND');
  });

  it('rate-limits the 31st subscribe in 60 s from one client', async () => {
    const anon = await connect({ forwardedFor: `10.0.0.1, ${randomUUID()}` });
    for (let i = 0; i < 30; i++) {
      expect(
        codeOf(await ask(anon, 'order.subscribe', { reference: 'ZZZZZ9' })),
      ).toBe('ORDER_NOT_FOUND');
    }
    expect(
      codeOf(await ask(anon, 'order.subscribe', { reference: 'ZZZZZ9' })),
    ).toBe('RATE_LIMITED');
  });

  it('tracks the client by the last X-Forwarded-For entry', async () => {
    const ip = `10.9.${Math.floor(Math.random() * 250)}.1`;
    const a = await connect({ forwardedFor: `${randomUUID()}, ${ip}` });
    const b = await connect({ forwardedFor: `${randomUUID()}, ${ip}` });
    for (let i = 0; i < 30; i++) {
      await ask(a, 'order.subscribe', { reference: 'ZZZZZ9' });
    }
    expect(
      codeOf(await ask(b, 'order.subscribe', { reference: 'ZZZZZ9' })),
    ).toBe('RATE_LIMITED');
  });

  it("keeps a Guest's socket out of other Orders' events", async () => {
    const a = await place();
    const guestA = await connect({ cookie: a.cookie });
    const events = record(guestA);
    const b = await place();
    expect(await advance(b.id, 'PREPARING')).toBe(200);
    // The ack is emitted after any event for B, and one socket keeps order.
    await ask(guestA, 'order.subscribe', {});
    expect(events).toEqual([]);
  });

  it('denies an undecorated handler with FORBIDDEN', async () => {
    const anon = await connect();
    expect(codeOf(await ask(anon, 'probe.ping', {}))).toBe('FORBIDDEN');
  });

  it('emits nothing for a failed advance', async () => {
    const { id } = await place();
    const board = await connect({ cookie: staff.cookie, staff: true });
    const events = record(board);
    expect(await advance(id, 'READY')).toBe(409);
    expect(await advance(randomUUID(), 'PREPARING')).toBe(404);
    const changed = next(board, 'order.status-changed');
    expect(await advance(id, 'PREPARING')).toBe(200);
    await changed;
    expect(events).toEqual([
      [
        'order.status-changed',
        expect.objectContaining({ status: 'PREPARING' }),
      ],
    ]);
  });

  it('disconnects the session’s sockets on logout', async () => {
    const board = await connect({ cookie: staff.cookie, staff: true });
    const reason = next(board, 'disconnect');
    const res = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', staff.cookie);
    expect(res.status).toBe(204);
    expect(await reason).toBe('io server disconnect');
  });
});
