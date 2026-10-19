import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Socket } from 'socket.io';

/**
 * {@link ThrottlerGuard} for gateway handlers: tracks the handshake instead of
 * an HTTP request and sets no headers.
 */
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  /** The socket's handshake as the "request"; a header-less "response". */
  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: Record<string, unknown>;
  } {
    const { handshake } = context.switchToWs().getClient<Socket>();
    return { req: handshake as unknown as Record<string, unknown>, res: {} };
  }

  /**
   * The client: the last `X-Forwarded-For` entry (the one Caddy, the single
   * proxy hop, appended), else the handshake address.
   */
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const { headers, address } = req as unknown as Socket['handshake'];
    const forwarded = [headers['x-forwarded-for'] ?? []].flat().join(',');
    const last = forwarded.split(',').pop()?.trim();
    return Promise.resolve(last || address);
  }
}
