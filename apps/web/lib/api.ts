import {
  ApiRoutes,
  apiPath,
  ErrorEnvelopeSchema,
  GuestOrderViewSchema,
  KitchenOrderSchema,
  StaffMeSchema,
  type ErrorEnvelope,
  type GuestOrderView,
  type KitchenOrder,
  type LoginRequest,
  type OrderStatus,
  type PlaceOrderRequest,
  type StaffMe,
} from '@restaurant/shared';
import { z } from 'zod';

/** How long to wait for the api before reporting a network error. */
const FETCH_TIMEOUT_MS = 10_000;

/** The `error` of an api error envelope. Branch on `code`, never `message`. */
export type ApiError = ErrorEnvelope['error'];

/** Outcome of an api call: parsed data, or the parsed (or synthesized) error. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * The single browser fetch wrapper: calls a same-origin `/api/v1/...` path,
 * parses success bodies with `schema` and failures with
 * {@link ErrorEnvelopeSchema}. Network errors and bodies that match neither
 * become an `INTERNAL` error, so callers only ever branch on `error.code`.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    console.error(`${path} failed: network error or timeout`);
    return { ok: false, error: { code: 'INTERNAL', message: 'Network error' } };
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return { ok: true, data: parsed.data };
  } else {
    const parsed = ErrorEnvelopeSchema.safeParse(body);
    if (parsed.success) return { ok: false, error: parsed.data.error };
  }
  console.error(`${path} failed: HTTP ${res.status} with an unexpected body`);
  return {
    ok: false,
    error: { code: 'INTERNAL', message: 'Unexpected response' },
  };
}

/** `POST /api/v1/orders`: places the Order; the api sets the session cookie. */
export function placeOrder(
  body: PlaceOrderRequest,
): Promise<ApiResult<GuestOrderView>> {
  return request(apiPath(ApiRoutes.orders), GuestOrderViewSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** `GET /api/v1/orders/current`: the Guest Session's Order, or 401. */
export function getCurrentOrder(): Promise<ApiResult<GuestOrderView>> {
  return request(`${apiPath(ApiRoutes.orders)}/current`, GuestOrderViewSchema);
}

/** `GET /api/v1/orders/by-reference/:reference`: any case, within 24 h. */
export function getOrderByReference(
  reference: string,
): Promise<ApiResult<GuestOrderView>> {
  return request(
    `${apiPath(ApiRoutes.orders)}/by-reference/${encodeURIComponent(reference)}`,
    GuestOrderViewSchema,
  );
}

/** Where a staff caller goes once its session cannot be refreshed. */
const STAFF_LOGIN_PAGE = '/kitchen/login';

/** The in-flight `auth/refresh`, shared by every staff call in this tab. */
let refreshing: Promise<ApiResult<undefined>> | null = null;

/** Starts `POST auth/refresh`, or joins the one already in flight. */
function refreshSession(): Promise<ApiResult<undefined>> {
  refreshing ??= request(`${apiPath(ApiRoutes.auth)}/refresh`, z.undefined(), {
    method: 'POST',
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * {@link request} for staff routes: on `401 UNAUTHENTICATED` it awaits one
 * shared refresh and retries once. A rejected refresh or a second 401 sends
 * the tab to the login page and returns `UNAUTHENTICATED`; any other refresh
 * failure (network, timeout) is returned without navigating.
 */
async function staffRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const first = await request(path, schema, init);
  if (first.ok || first.error.code !== 'UNAUTHENTICATED') return first;
  const refreshed = await refreshSession();
  if (!refreshed.ok) {
    if (refreshed.error.code === 'UNAUTHENTICATED')
      window.location.assign(STAFF_LOGIN_PAGE);
    return { ok: false, error: refreshed.error };
  }
  const retry = await request(path, schema, init);
  if (!retry.ok && retry.error.code === 'UNAUTHENTICATED')
    window.location.assign(STAFF_LOGIN_PAGE);
  return retry;
}

/** `POST /api/v1/auth/login`: sets the staff cookies on success. */
export function login(body: LoginRequest): Promise<ApiResult<StaffMe>> {
  return request(`${apiPath(ApiRoutes.auth)}/login`, StaffMeSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** `POST /api/v1/auth/logout`: revokes the session and clears the cookies. */
export function logout(): Promise<ApiResult<undefined>> {
  return staffRequest(`${apiPath(ApiRoutes.auth)}/logout`, z.undefined(), {
    method: 'POST',
  });
}

/** `GET /api/v1/kitchen/orders`: every open Order, oldest first. */
export function listKitchenOrders(): Promise<ApiResult<KitchenOrder[]>> {
  return staffRequest(
    apiPath(ApiRoutes.kitchenOrders),
    z.array(KitchenOrderSchema),
  );
}

/** `PATCH /api/v1/kitchen/orders/:id/status`: moves the Order to `to`. */
export function advanceOrder(
  id: string,
  to: OrderStatus,
): Promise<ApiResult<KitchenOrder>> {
  return staffRequest(
    `${apiPath(ApiRoutes.kitchenOrders)}/${encodeURIComponent(id)}/status`,
    KitchenOrderSchema,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    },
  );
}
