import { randomBytes } from 'node:crypto';
import type { OrderStatus } from '@restaurant/shared';

/** How long a Guest Session lasts after placement: 24 h. */
export const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;

/** Shape of a session id: 128 bits as lowercase hex. */
const SESSION_ID = /^[0-9a-f]{32}$/;

/**
 * Guest Session rules (pure). A session is open until its Order is
 * `COLLECTED` or `placedAt + 24 h`, whichever comes first.
 */
export const GuestSessionPolicy = {
  /** Returns a new opaque session id from a CSPRNG. */
  newSessionId(): string {
    return randomBytes(16).toString('hex');
  },

  /** Whether `v` is a well-formed session id. */
  isSessionId(v: unknown): v is string {
    return typeof v === 'string' && SESSION_ID.test(v);
  },

  /** Instant the session for an Order placed at `placedAt` ends. */
  expiresAt(placedAt: Date): Date {
    return new Date(placedAt.getTime() + GUEST_SESSION_MS);
  },

  /** Whether the session of `order` is still open at `now`. */
  isOpen(order: { status: OrderStatus; placedAt: Date }, now: Date): boolean {
    return (
      order.status !== 'COLLECTED' &&
      now.getTime() < GuestSessionPolicy.expiresAt(order.placedAt).getTime()
    );
  },
};
