/**
 * Returns the value of cookie `name` from a `Cookie` request header, or
 * `undefined` when the header or the cookie is absent. Minimal parser: values
 * are taken verbatim (no decoding), the first match wins.
 */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const pair of header?.split(';') ?? []) {
    const eq = pair.indexOf('=');
    if (eq !== -1 && pair.slice(0, eq).trim() === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}
