import type { KitchenOrder, KitchenStatusChanged } from '@restaurant/shared';

/**
 * Outbound port for Order events (ports-and-adapters). Only `OrdersService`
 * calls it, and only after the write committed. Fire-and-forget.
 */
export abstract class OrderEventsPublisher {
  /** A new Order was stored: tell the kitchen. */
  abstract orderCreated(order: KitchenOrder): void;

  /** An Order moved: tell the kitchen (with `id`) and its followers (without). */
  abstract statusChanged(event: KitchenStatusChanged): void;
}
