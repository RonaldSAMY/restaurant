import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentOrder, getOrderByReference, placeOrder } from './api';

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
