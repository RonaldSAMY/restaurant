/**
 * Prefix the api mounts every route under. Change the version here; only the
 * version segment can change without updating the Caddyfile's `/api/*` route.
 */
export const API_PREFIX = 'api/v1';

/**
 * Every endpoint as a path template relative to {@link API_PREFIX}. Nest
 * decorators take these as-is; web turns them into URLs with {@link apiPath}.
 */
export const ApiRoutes = {
  health: 'health',
  menu: 'menu',
  orders: 'orders',
  ordersCurrent: 'orders/current',
  ordersByReference: 'orders/by-reference/:reference',
  authLogin: 'auth/login',
  authRefresh: 'auth/refresh',
  authLogout: 'auth/logout',
  authMe: 'auth/me',
  kitchenOrders: 'kitchen/orders',
  kitchenOrderStatus: 'kitchen/orders/:id/status',
} as const;

/** One of the {@link ApiRoutes} values. */
export type ApiRoute = (typeof ApiRoutes)[keyof typeof ApiRoutes];

/** Union of the `:name` params in route template `R`; `never` if none. */
type Params<R> = R extends `${string}:${infer P}/${infer Rest}`
  ? P | Params<Rest>
  : R extends `${string}:${infer P}`
    ? P
    : never;

/**
 * Root-relative URL path for an endpoint, e.g. `/api/v1/menu`. Each `:name`
 * in the template is replaced by `encodeURIComponent(params.name)`; routes
 * with params require exactly those keys.
 */
export function apiPath<R extends ApiRoute>(
  route: R,
  ...params: [Params<R>] extends [never] ? [] : [Record<Params<R>, string>]
): string {
  const values: Record<string, string> = params[0] ?? {};
  return `/${API_PREFIX}/${route.replace(/:([^/]+)/g, (_, name: string) =>
    encodeURIComponent(values[name]),
  )}`;
}
