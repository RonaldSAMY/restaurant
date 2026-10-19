import { Injectable, Logger } from '@nestjs/common';
import type { GuestOrderView, PlaceOrderRequest } from '@restaurant/shared';
import { Clock } from '../common/clock';
import { DomainError } from '../common/domain-error';
import { Prisma } from '../generated/prisma/client';
import { MenuService } from '../menu/menu.service';
import { OrderReference } from './domain/order-reference';
import {
  type NewOrderItem,
  OrderRepository,
  type StoredOrder,
} from './ports/order-repository';

/** Largest quantity of one Menu Item in one Order (after merging lines). */
const MAX_QUANTITY = 99;

/** Inserts tried before a reference collision is given up on. */
const MAX_ATTEMPTS = 5;

/** Order use cases. */
@Injectable()
export class OrdersService {
  /** Logs placements by reference only. */
  private readonly logger = new Logger(OrdersService.name);

  /** Receives the Menu, the Order store and the clock. */
  constructor(
    private readonly menu: MenuService,
    private readonly orders: OrderRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Places an Order: merges duplicate lines, prices them from the Menu,
   * stores the Order as `RECEIVED` (retrying reference collisions) and
   * returns the Guest view.
   * @throws DomainError `VALIDATION_FAILED` when a merged quantity exceeds 99,
   *   `MENU_ITEM_NOT_FOUND` when a Menu Item does not exist.
   */
  async place(req: PlaceOrderRequest): Promise<GuestOrderView> {
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
    return toGuestView(order, items);
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

/**
 * Maps a stored Order to the Guest view (no internal id). Lines come from the
 * in-memory `items` (first-appearance order), not the unordered stored rows.
 */
function toGuestView(
  order: StoredOrder,
  items: NewOrderItem[],
): GuestOrderView {
  return {
    reference: order.reference,
    guestName: order.guestName,
    status: order.status,
    items: items.map(({ name, quantity, unitPriceCents }) => ({
      name,
      quantity,
      unitPriceCents,
    })),
    totalCents: order.totalCents,
    placedAt: order.placedAt.toISOString(),
  };
}
