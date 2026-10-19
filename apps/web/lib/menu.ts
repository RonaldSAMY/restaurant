import {
  ApiRoutes,
  apiPath,
  MenuResponseSchema,
  type MenuResponse,
} from '@restaurant/shared';
import { parseEnv } from './env';

/** EUR formatter for Menu prices (e.g. `€6.50`); built once per module. */
const priceFormat = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});

/**
 * Formats an integer-cents price for display. The only place cents become a
 * currency string.
 */
export function formatPrice(cents: number): string {
  return priceFormat.format(cents / 100);
}

/** How long to wait for the api before treating the Menu as unavailable. */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the Menu from the api server-side, uncached, and validates it with
 * {@link MenuResponseSchema}. Returns `null` (after logging) on any network,
 * HTTP or shape failure so the page can show "Menu unavailable" instead of
 * hitting the error boundary.
 */
export async function fetchMenu(): Promise<MenuResponse | null> {
  const url = `${parseEnv().API_INTERNAL_URL}${apiPath(ApiRoutes.menu)}`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Menu fetch failed: HTTP ${res.status}`);
      return null;
    }
    const parsed = MenuResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.error('Menu fetch failed: response does not match MenuResponse');
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error(`Menu fetch failed: ${describeError(err)}`);
    return null;
  }
}

/**
 * Describes a fetch error for the log. undici reports connection failures as
 * `fetch failed` with the real reason (e.g. ECONNREFUSED) in `cause`.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.cause instanceof Error
    ? `${err.message}: ${err.cause.message}`
    : err.message;
}
