import { Injectable, Logger } from '@nestjs/common';
import type {
  GuestOrderView,
  KitchenOrder,
  OrderStatus,
  PlaceOrderRequest,
} from '@restaurant/shared';
import { z } from 'zod';
import { Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { Prisma } from '../generated/prisma/client';
import { MenuService } from '../menu/menu.service';
import { GuestSessionPolicy } from './domain/guest-session-policy';
import { OrderReference } from './domain/order-reference';
import { OrderStatusMachine } from './domain/order-status-machine';
import { GuestSessionService } from './guest-session.service';
import {
  type NewOrderItem,
  OrderRepository,
  type StoredOrder,
} from './ports/order-repository';

/** Largest quantity of one Menu Item in one Order (after merging lines). */
const MAX_QUANTITY = 99;

/** Inserts tried before a reference collision is given up on. */
const MAX_ATTEMPTS = 5;

/** Result of a placement: the Guest view and the new Guest Session. */
export interface PlacedOrder {
  /** Guest view of the new Order. */
  view: GuestOrderView;
  /** Id of the session opened for it (the cookie value). */
  sid: string;
  /** When the session ends at the latest (placedAt + 24 h). */
  expiresAt: Date;
}

/** Order use cases. */
@Injectable()
export class OrdersService {
  /** Logs placements by reference only. */
  private readonly logger = new Logger(OrdersService.name);

  /** Receives the Menu, the Order store, the Guest Sessions and the clock. */
  constructor(
    private readonly menu: MenuService,
    private readonly orders: OrderRepository,
    private readonly sessions: GuestSessionService,
    private readonly clock: Clock,
  ) {}

  /**
   * Places an Order: merges duplicate lines, prices them from the Menu,
   * stores the Order as `RECEIVED` (retrying reference collisions), opens a
   * Guest Session for it and returns the Guest view with the session.
   * @param sid - the caller's current session id, if any; a stale one is ignored.
   * @throws DomainError `ORDER_ALREADY_OPEN` while `sid`'s session is open,
   *   `VALIDATION_FAILED` when a merged quantity exceeds 99,
   *   `MENU_ITEM_NOT_FOUND` when a Menu Item does not exist.
   */
  async place(req: PlaceOrderRequest, sid?: string): Promise<PlacedOrder> {
    // ponytail: two concurrent POSTs can both pass this check and create two
    // Orders (last cookie wins); a `SET NX` placement lock fixes it if it matters.
    const open = await this.sessions.resolve(sid);
    if (open) {
      throw new DomainError('ORDER_ALREADY_OPEN', 'An Order is already open', {
        reference: open.order.reference,
      });
    }

    const quantities = new Map<string, number>();
    for (const { menuItemId, quantity } of req.items) {
      quantities.set(menuItemId, (quantities.get(menuItemId) ?? 0) + quantity);
    }
    for (const quantity of quantities.values()) {
      if (quantity > MAX_QUANTITY) {
        throw new DomainError('VALIDATION_FAILED', 'Validation failed', [
          {
            path: 'items',
            message: `Total quantity per Menu Item must be at most ${MAX_QUANTITY}`,
          },
        ]);
      }
    }

    const found = new Map(
      (await this.menu.findItems([...quantities.keys()])).map((m) => [m.id, m]),
    );
    const items: NewOrderItem[] = [...quantities].map(([id, quantity]) => {
      const menuItem = found.get(id);
      if (!menuItem) {
        throw new DomainError('MENU_ITEM_NOT_FOUND', 'Menu Item not found', {
          menuItemId: id,
        });
      }
      const { name, priceCents } = menuItem;
      return { menuItemId: id, name, quantity, unitPriceCents: priceCents };
    });
    const totalCents = items.reduce(
      (sum, i) => sum + i.quantity * i.unitPriceCents,
      0,
    );

    const order = await this.insert(req.guestName, items, totalCents);
    this.logger.log(`Order placed reference=${order.reference}`);
    // ponytail: insert and Redis SET are not atomic; a failed SET (500) leaves
    // an Order without a session, reachable by reference from Story 2.3.
    const newSid = await this.sessions.open(order);
    return {
      view: toGuestView(order),
      sid: newSid,
      expiresAt: GuestSessionPolicy.expiresAt(order.placedAt),
    };
  }

  /** Returns the Guest view of the session's Order (`orderId` from the principal). */
  async current(orderId: string): Promise<GuestOrderView> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new DomainError('UNAUTHENTICATED', 'Authentication required');
    }
    return toGuestView(order);
  }

  /**
   * Returns the Guest view of the Order with `reference` (any letter case)
   * while `clock.now() < placedAt + 24 h`; Collected Orders stay visible.
   * @throws DomainError `ORDER_NOT_FOUND`, identical for malformed, unknown
   *   and expired references.
   */
  async byReference(reference: string): Promise<GuestOrderView> {
    const ref = OrderReference.normalize(reference);
    const order = ref ? await this.orders.findByReference(ref) : null;
    // The lookup window is the Guest Session's 24 h, minus the Collected rule.
    const expired =
      order && this.clock.now() >= GuestSessionPolicy.expiresAt(order.placedAt);
    if (!order || expired) {
      throw new DomainError('ORDER_NOT_FOUND', 'Order not found');
    }
    return toGuestView(order);
  }

  /** Returns every non-Collected Order for the Kitchen Board, oldest first. */
  async listOpen(): Promise<KitchenOrder[]> {
    return (await this.orders.findOpen()).map(toKitchenView);
  }

  /**
   * Moves the Order with `id` one step forward to `to`, as one conditional
   * write (no read-then-write), so of two racing advances exactly one wins.
   * @throws DomainError `ORDER_NOT_FOUND` for a malformed or unknown id,
   *   `INVALID_TRANSITION` when the Order is not in `to`'s predecessor.
   */
  async advance(id: string, to: OrderStatus): Promise<KitchenOrder> {
    if (!z.uuid().safeParse(id).success) throw orderNotFound();
    const from = OrderStatusMachine.predecessorOf(to);
    if (!from || !(await this.orders.transition(id, from, to))) {
      if (!(await this.orders.findById(id))) throw orderNotFound();
      throw new DomainError('INVALID_TRANSITION', 'Invalid status transition', {
        to,
      });
    }
    const order = await this.orders.findById(id);
    if (!order) throw orderNotFound();
    this.logger.log(
      `Order status reference=${order.reference} from=${from} to=${to}`,
    );
    return toKitchenView(order);
  }

  /** Inserts the Order, retrying with a new reference on a `P2002`. */
  private async insert(
    guestName: string,
    items: NewOrderItem[],
    totalCents: number,
  ): Promise<StoredOrder> {
    const placedAt = this.clock.now();
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.orders.create({
          reference: OrderReference.generate(),
          guestName,
          status: 'RECEIVED',
          totalCents,
          placedAt,
          items,
        });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!collision || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }
}

/** Maps a stored Order (items in basket order) to the Guest view (no internal id). */
function toGuestView(order: StoredOrder): GuestOrderView {
  return {
    reference: order.reference,
    guestName: order.guestName,
    status: order.status,
    items: order.items.map(({ name, quantity, unitPriceCents }) => ({
      name,
      quantity,
      unitPriceCents,
    })),
    totalCents: order.totalCents,
    placedAt: order.placedAt.toISOString(),
  };
}

/** Maps a stored Order to the Kitchen view: the Guest view plus `id`. */
function toKitchenView(order: StoredOrder): KitchenOrder {
  return { id: order.id, ...toGuestView(order) };
}

/** The 404 for a malformed or unknown Order id. */
function orderNotFound(): DomainError {
  return new DomainError('ORDER_NOT_FOUND', 'Order not found');
}
