import { describe, expect, it } from 'vitest';
import { ApiRoutes, apiPath } from './api-routes';

describe('apiPath', () => {
  it('prefixes a no-param route', () => {
    expect(apiPath(ApiRoutes.menu)).toBe('/api/v1/menu');
  });

  it('substitutes params', () => {
    expect(apiPath(ApiRoutes.kitchenOrderStatus, { id: 'x' })).toBe(
      '/api/v1/kitchen/orders/x/status',
    );
  });

  it('encodes params', () => {
    expect(apiPath(ApiRoutes.ordersByReference, { reference: 'ab 1/' })).toBe(
      '/api/v1/orders/by-reference/ab%201%2F',
    );
  });

  it('rejects missing or extra params at compile time', () => {
    // Runtime is irrelevant here; `tsc` checks each @ts-expect-error.
    const typeOnly = () => {
      // @ts-expect-error params required
      apiPath(ApiRoutes.kitchenOrderStatus);
      // @ts-expect-error id missing
      apiPath(ApiRoutes.kitchenOrderStatus, {});
      // @ts-expect-error extra key
      apiPath(ApiRoutes.kitchenOrderStatus, { id: 'x', foo: 'y' });
      // @ts-expect-error no params on a param-less route
      apiPath(ApiRoutes.menu, {});
    };
    expect(typeOnly).toBeTypeOf('function');
  });
});
