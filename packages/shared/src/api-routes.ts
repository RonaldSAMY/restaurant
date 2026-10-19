/**
 * Prefix the api mounts every route under. Change the version here; only the
 * version segment can change without updating the Caddyfile's `/api/*` route.
 */
export const API_PREFIX = 'api/v1';

/** Endpoint paths relative to {@link API_PREFIX}. */
export const ApiRoutes = {
  health: 'health',
  menu: 'menu',
  orders: 'orders',
  auth: 'auth',
  kitchenOrders: 'kitchen/orders',
} as const;

/** One of the {@link ApiRoutes} values. */
export type ApiRoute = (typeof ApiRoutes)[keyof typeof ApiRoutes];

/** Root-relative URL path for an endpoint, e.g. `/api/v1/menu`. */
export function apiPath(route: ApiRoute): string {
  return `/${API_PREFIX}/${route}`;
}
