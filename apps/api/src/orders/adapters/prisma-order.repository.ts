import { Injectable } from '@nestjs/common';
import type { OrderStatus } from '@restaurant/shared';
import { PrismaService } from '../../common/prisma.module';
import {
  type NewOrder,
  OrderRepository,
  type StoredOrder,
} from '../ports/order-repository';

/** Every Order read returns its items in basket order. */
const ITEMS_IN_ORDER = { items: { orderBy: { position: 'asc' } } } as const;

/** {@link OrderRepository} on Postgres through Prisma. */
@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  /** Receives the database client. */
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Inserts the Order with its items in one nested create (atomic), storing
   * each item's array index as `position`. A `P2002` on `reference`
   * propagates to the caller.
   */
  create({ items, ...order }: NewOrder): Promise<StoredOrder> {
    return this.prisma.order.create({
      data: {
        ...order,
        items: {
          create: items.map((item, position) => ({ ...item, position })),
        },
      },
      include: ITEMS_IN_ORDER,
    });
  }

  /** Returns the Order with its items, or `null` when it does not exist. */
  findById(id: string): Promise<StoredOrder | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: ITEMS_IN_ORDER,
    });
  }

  /** Returns the Order with `reference` and its items, or `null`. */
  findByReference(reference: string): Promise<StoredOrder | null> {
    return this.prisma.order.findUnique({
      where: { reference },
      include: ITEMS_IN_ORDER,
    });
  }

  /** Returns every non-`COLLECTED` Order, oldest first (`id` breaks ties). */
  findOpen(): Promise<StoredOrder[]> {
    return this.prisma.order.findMany({
      where: { status: { not: 'COLLECTED' } },
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      include: ITEMS_IN_ORDER,
    });
  }

  /** `UPDATE … WHERE id = :id AND status = :from`; `true` when a row changed. */
  async transition(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
  ): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    return count > 0;
  }
}
