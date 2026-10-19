/**
 * Prefix the api mounts every route under. Change the version here; only the
 * version segment can change without updating the Caddyfile's `/api/*` route.
 */
export const API_PREFIX = 'api/v1';

/** Endpoint paths relative to {@link API_PREFIX}. */
export const ApiRoutes = { health: 'health', menu: 'menu' } as const;

/** Root-relative URL path for an endpoint, e.g. `/api/v1/menu`. */
export function apiPath(route: string): string {
  return `/${API_PREFIX}/${route}`;
}
