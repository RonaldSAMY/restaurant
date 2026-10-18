import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMenu, formatPrice } from './menu';

/** A valid two-category Menu body. */
const menu = {
  categories: [
    {
      name: 'Mains',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Burger',
          description: 'Beef',
          priceCents: 1450,
        },
      ],
    },
    { name: 'Starters', items: [] },
  ],
};

describe('formatPrice', () => {
  it.each([
    [0, '€0.00'],
    [650, '€6.50'],
    [1999, '€19.99'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected);
  });
});

describe('fetchMenu', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:3000');
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Stubs global `fetch` with the given implementation and returns the mock. */
  function stubFetch(impl: () => Promise<Response>) {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns the parsed Menu and requests the api uncached', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(Response.json(menu, { status: 200 })),
    );
    await expect(fetchMenu()).resolves.toEqual(menu);
    expect(fetchMock).toHaveBeenCalledWith('http://api:3000/api/v1/menu', {
      cache: 'no-store',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('returns an empty Menu as-is', async () => {
    stubFetch(() => Promise.resolve(Response.json({ categories: [] })));
    await expect(fetchMenu()).resolves.toEqual({ categories: [] });
  });

  it.each([
    [
      'the api times out',
      () =>
        Promise.reject(
          new DOMException('The operation was aborted', 'TimeoutError'),
        ),
    ],
    [
      'the api returns 5xx',
      () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'INTERNAL', message: 'boom' } },
            { status: 500 },
          ),
        ),
    ],
    [
      'the body has a bad shape',
      () => Promise.resolve(Response.json({ categories: 'nope' })),
    ],
  ])('returns null and logs when %s', async (_case, impl) => {
    const fetchMock = stubFetch(impl);
    await expect(fetchMenu()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api:3000/api/v1/menu',
      expect.anything(),
    );
    expect(error).toHaveBeenCalledOnce();
  });

  it('returns null and logs the cause when the api is unreachable', async () => {
    stubFetch(() =>
      Promise.reject(
        new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }),
      ),
    );
    await expect(fetchMenu()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });
});
