import type { ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import type { Socket } from 'socket.io';

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

/**
 * Returns cookie `name` from the caller's `Cookie` header: the HTTP request's,
 * or the Socket.IO handshake's on a ws host.
 */
export function readContextCookie(
  context: ArgumentsHost,
  name: string,
): string | undefined {
  const header =
    context.getType() === 'ws'
      ? context.switchToWs().getClient<Socket>().handshake.headers.cookie
      : context.switchToHttp().getRequest<Request>().headers.cookie;
  return readCookie(header, name);
}
