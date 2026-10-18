/** The part of an HTTP response (e.g. a Supertest response) that carries cookies. */
export type CookieSource = {
  /** Response headers; Node exposes `set-cookie` as an array. */
  headers: { 'set-cookie'?: string | string[] };
};

/**
 * Builds a `Cookie` request header from a response's `Set-Cookie` headers,
 * keeping each `name=value` and dropping attributes (`Path`, `HttpOnly`, ...).
 * Returns `""` when the response set no cookies.
 */
export function cookieHeader(res: CookieSource): string {
  const setCookie = res.headers['set-cookie'] ?? [];
  return [setCookie]
    .flat()
    .map((cookie) => cookie.split(';')[0].trim())
    .join('; ');
}
