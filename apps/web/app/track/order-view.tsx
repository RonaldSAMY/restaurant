import {
  type GuestOrderView,
  type OrderStatus,
  OrderStatusSchema,
} from '@restaurant/shared';
import type { ApiError } from '../../lib/api';
import { formatPrice } from '../../lib/menu';

/** Guest-facing label for each status. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COLLECTED: 'Collected',
};

/** Whether `next` comes later in the lifecycle than `held` (live events only move forward). */
export function ranksLater(next: OrderStatus, held: OrderStatus): boolean {
  const rank = OrderStatusSchema.options;
  return rank.indexOf(next) > rank.indexOf(held);
}

/** Maps a failed Order load to its message, by `code` only. */
export function describeLookupError(error: ApiError): string {
  switch (error.code) {
    case 'ORDER_NOT_FOUND':
      return 'Order not found. Check the reference and try again.';
    case 'RATE_LIMITED':
      return 'Too many lookups. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** One Order: status first and large, then reference, name, items and total. */
export function OrderView({ order }: { order: GuestOrderView }) {
  return (
    <article className="order" aria-labelledby="order-status">
      <p id="order-status" className="order-status">
        {STATUS_LABELS[order.status]}
      </p>
      <dl className="order-facts">
        <dt>Reference</dt>
        <dd className="order-reference">{order.reference}</dd>
        <dt>Name</dt>
        <dd>{order.guestName}</dd>
      </dl>
      <ul className="items">
        {order.items.map((item, index) => (
          <li key={index} className="item-row">
            <span className="item-name">
              {item.quantity} × {item.name}
            </span>
            <span className="item-price">
              {formatPrice(item.unitPriceCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <p className="item-row basket-total">
        <span>Total</span>
        <span className="item-price">{formatPrice(order.totalCents)}</span>
      </p>
    </article>
  );
}
