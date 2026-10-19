import type { OrderStatus } from '@restaurant/shared';

/** One Order line to store, with name and price copied from the Menu Item. */
export interface NewOrderItem {
  /** Menu Item the line was ordered from. */
  menuItemId: string;
  /** Snapshot of the Menu Item name. */
  name: string;
  /** How many, 1 to 99. */
  quantity: number;
  /** Snapshot of the Menu Item price, in cents. */
  unitPriceCents: number;
}

/** An Order to store. */
export interface NewOrder {
  /** Unique Guest-facing reference. */
  reference: string;
  /** Name given by the Guest; not unique. */
  guestName: string;
  /** Lifecycle step. */
  status: OrderStatus;
  /** Sum of quantity × unit price, in cents. */
  totalCents: number;
  /** Placement time from the `Clock`. */
  placedAt: Date;
  /** Order lines, in basket order. */
  items: NewOrderItem[];
}

/** An Order as stored, with its internal id. */
export interface StoredOrder extends NewOrder {
  /** Internal UUID; never shown to Guests. */
  id: string;
}

/** Persistence port for Orders (ports-and-adapters). */
export abstract class OrderRepository {
  /**
   * Stores the Order and its items atomically and returns them. A taken
   * `reference` fails with the driver's unique-violation error.
   */
  abstract create(order: NewOrder): Promise<StoredOrder>;

  /** Returns the Order with its items in basket order, or `null`. */
  abstract findById(id: string): Promise<StoredOrder | null>;
}
