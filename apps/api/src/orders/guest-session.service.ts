import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { REDIS, type RedisClient } from '../common/redis.module';
import { GuestSessionPolicy } from './domain/guest-session-policy';
import { OrderRepository, type StoredOrder } from './ports/order-repository';

/** An open Guest Session and the Order it belongs to. */
export interface GuestSession {
  /** Opaque session id (the cookie value). */
  sid: string;
  /** The session's Order, as stored. */
  order: StoredOrder;
}

/** Redis key mapping a session id to its Order id. */
const key = (sid: string) => `guest:session:${sid}`;

/**
 * Sole owner of the Redis keys `guest:session:{sid}` → orderId. The key TTL
 * is cleanup only; {@link GuestSessionService.resolve} is the single
 * validity check.
 */
@Injectable()
export class GuestSessionService {
  /** Receives Redis, the Order store and the clock. */
  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    private readonly orders: OrderRepository,
    private readonly clock: Clock,
  ) {}

  /** Opens a session for `order` and returns its new session id. */
  async open(order: StoredOrder): Promise<string> {
    const sid = GuestSessionPolicy.newSessionId();
    const ttl =
      GuestSessionPolicy.expiresAt(order.placedAt).getTime() -
      this.clock.now().getTime();
    await this.redis.set(key(sid), order.id, {
      expiration: { type: 'PX', value: Math.max(ttl, 1) },
    });
    return sid;
  }

  /**
   * Returns the session when `sid` is well-formed, its key exists and its
   * Order is still open ({@link GuestSessionPolicy.isOpen}). Otherwise
   * deletes the key and returns `null`; a malformed `sid` touches no Redis.
   */
  async resolve(sid?: string): Promise<GuestSession | null> {
    if (!GuestSessionPolicy.isSessionId(sid)) return null;
    const orderId = await this.redis.get(key(sid));
    const order = orderId === null ? null : await this.orders.findById(orderId);
    if (order && GuestSessionPolicy.isOpen(order, this.clock.now())) {
      return { sid, order };
    }
    await this.redis.del(key(sid));
    return null;
  }
}
