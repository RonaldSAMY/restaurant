import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advanceOrder,
  getCurrentOrder,
  getOrderByReference,
  listKitchenOrders,
  login,
  logout,
  placeOrder,
} from './api';

/** A valid place-order body. */
const request = {
  guestName: 'Ana',
  items: [{ menuItemId: '00000000-0000-4000-8000-000000000001', quantity: 2 }],
};
/** A valid Guest view for {@link request}. */
const view = {
  reference: 'AB12CD',
  guestName: 'Ana',
  status: 'RECEIVED',
  items: [{ name: 'Burger', quantity: 2, unitPriceCents: 1450 }],
  totalCents: 2900,
  placedAt: '2026-10-19T12:00:00.000Z',
};

describe('placeOrder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Stubs global `fetch` with the given implementation and returns the mock. */
  function stubFetch(impl: () => Promise<Response>) {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('POSTs JSON same-origin and parses the Guest view', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(Response.json(view, { status: 201 })),
    );
    await expect(placeOrder(request)).resolves.toEqual({
      ok: true,
      data: view,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('returns the parsed error envelope', async () => {
    const error = {
      code: 'ORDER_ALREADY_OPEN',
      message: 'An Order is already open',
      details: { reference: 'AB12CD' },
    };
    stubFetch(() => Promise.resolve(Response.json({ error }, { status: 409 })));
    await expect(placeOrder(request)).resolves.toEqual({ ok: false, error });
  });

  it.each([
    [
      'a success body that fails the schema',
      () => Response.json({}, { status: 201 }),
    ],
    [
      'an error body that is not an envelope',
      () => new Response('oops', { status: 502 }),
    ],
  ])('maps %s to INTERNAL', async (_, response) => {
    stubFetch(() => Promise.resolve(response()));
    const result = await placeOrder(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('maps a network failure to INTERNAL', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    await expect(placeOrder(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL' },
    });
  });

  it('maps a timeout to INTERNAL', async () => {
    stubFetch(() =>
      Promise.reject(new DOMException('timed out', 'TimeoutError')),
    );
    await expect(placeOrder(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL' },
    });
  });
});

describe('Order GETs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['getCurrentOrder', () => getCurrentOrder(), '/api/v1/orders/current'],
    [
      'getOrderByReference',
      () => getOrderByReference('ab 1/'),
      '/api/v1/orders/by-reference/ab%201%2F',
    ],
  ])('%s GETs %s and parses the Guest view', async (_, call, path) => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(view)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toEqual({ ok: true, data: view });
    expect(fetchMock).toHaveBeenCalledWith(path, expect.anything());
  });
});

/** A valid Kitchen Order. */
const kitchenOrder = { ...view, id: '00000000-0000-4000-8000-0000000000aa' };

/** A 401 UNAUTHENTICATED envelope response. */
function unauthenticated() {
  return Response.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Unauthenticated' } },
    { status: 401 },
  );
}

/** Paths fetched by `fetchMock`, in call order. */
function calledPaths(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.map(([path]) => path);
}

describe('staff calls', () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Stubs `fetch` to answer each call with the next queued response. */
  function stubResponses(...responses: (() => Response)[]) {
    const fetchMock = vi.fn<typeof fetch>(() => {
      const next = responses.shift();
      if (!next) throw new Error('unexpected fetch');
      return Promise.resolve(next());
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('login POSTs the body to auth/login and parses StaffMe', async () => {
    const me = { id: kitchenOrder.id, email: 'chef@example.com' };
    const fetchMock = stubResponses(() => Response.json(me));
    const body = { email: 'chef@example.com', password: 'pw' };
    await expect(login(body)).resolves.toEqual({ ok: true, data: me });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    );
  });

  it('login does not refresh on 401', async () => {
    const fetchMock = stubResponses(() =>
      Response.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'x' } },
        { status: 401 },
      ),
    );
    await expect(
      login({ email: 'a@b.co', password: 'x' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes once on 401 and retries', async () => {
    const fetchMock = stubResponses(
      unauthenticated,
      () => new Response(null, { status: 204 }),
      () => Response.json([kitchenOrder]),
    );
    await expect(listKitchenOrders()).resolves.toEqual({
      ok: true,
      data: [kitchenOrder],
    });
    expect(calledPaths(fetchMock)).toEqual([
      '/api/v1/kitchen/orders',
      '/api/v1/auth/refresh',
      '/api/v1/kitchen/orders',
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('starts a new refresh once the previous one settled', async () => {
    const cycle = [
      unauthenticated,
      () => new Response(null, { status: 204 }),
      () => Response.json([kitchenOrder]),
    ];
    const fetchMock = stubResponses(...cycle, ...cycle);
    await expect(listKitchenOrders()).resolves.toMatchObject({ ok: true });
    await expect(listKitchenOrders()).resolves.toMatchObject({ ok: true });
    expect(
      calledPaths(fetchMock).filter((p) => p === '/api/v1/auth/refresh'),
    ).toHaveLength(2);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let refreshed = false;
    let releaseRefresh = () => {};
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/v1/auth/refresh')
        return new Promise<Response>((resolve) => {
          releaseRefresh = () => {
            refreshed = true;
            resolve(new Response(null, { status: 204 }));
          };
        });
      return Promise.resolve(
        refreshed ? Response.json([kitchenOrder]) : unauthenticated(),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const both = Promise.all([listKitchenOrders(), listKitchenOrders()]);
    // Let both first attempts 401 and join the refresh before it settles.
    await vi.waitFor(() => {
      expect(calledPaths(fetchMock)).toContain('/api/v1/auth/refresh');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();
    const results = await both;
    expect(results.every((r) => r.ok)).toBe(true);
    expect(
      calledPaths(fetchMock).filter((p) => p === '/api/v1/auth/refresh'),
    ).toHaveLength(1);
  });

  it('goes to the login page when the refresh fails', async () => {
    const fetchMock = stubResponses(unauthenticated, unauthenticated);
    await expect(listKitchenOrders()).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith('/kitchen/login');
  });

  it('goes to the login page when the retry is 401, without a second refresh', async () => {
    const fetchMock = stubResponses(
      unauthenticated,
      () => new Response(null, { status: 204 }),
      unauthenticated,
    );
    await expect(logout()).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(calledPaths(fetchMock)).toEqual([
      '/api/v1/auth/logout',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
    ]);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/kitchen/login');
  });

  it.each([409, 500])(
    'returns a %i as-is without refreshing',
    async (status) => {
      const error = { code: 'INVALID_TRANSITION', message: 'x' };
      const fetchMock = stubResponses(() =>
        Response.json({ error }, { status }),
      );
      await expect(advanceOrder('a', 'PREPARING')).resolves.toEqual({
        ok: false,
        error,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('advanceOrder PATCHes the encoded status path', async () => {
    const fetchMock = stubResponses(() => Response.json(kitchenOrder));
    await expect(advanceOrder('a b/c', 'READY')).resolves.toEqual({
      ok: true,
      data: kitchenOrder,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/kitchen/orders/a%20b%2Fc/status',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'READY' }),
      }),
    );
  });

  it('logout parses a 204', async () => {
    stubResponses(() => new Response(null, { status: 204 }));
    await expect(logout()).resolves.toEqual({ ok: true, data: undefined });
  });
});
