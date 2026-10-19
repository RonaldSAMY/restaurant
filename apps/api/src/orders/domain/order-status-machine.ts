import type { OrderStatus } from '@restaurant/shared';

/** Required prior status for each target; `null` means nothing moves into it. */
const PREDECESSOR: Record<OrderStatus, OrderStatus | null> = {
  RECEIVED: null,
  PREPARING: 'RECEIVED',
  READY: 'PREPARING',
  COLLECTED: 'READY',
};

/**
 * Order lifecycle rules (pure): `RECEIVED → PREPARING → READY → COLLECTED`,
 * forward one step only. `COLLECTED` is final because no status has it as
 * predecessor.
 */
export const OrderStatusMachine = {
  /** Status an Order must be in to move to `to`, or `null` for `RECEIVED`. */
  predecessorOf(to: OrderStatus): OrderStatus | null {
    return PREDECESSOR[to];
  },
};
