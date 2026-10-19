import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import {
  type NewOrder,
  OrderRepository,
  type StoredOrder,
} from '../ports/order-repository';

/** {@link OrderRepository} on Postgres through Prisma. */
@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  /** Receives the database client. */
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Inserts the Order with its items in one nested create (atomic). A `P2002`
   * on `reference` propagates to the caller.
   */
  create({ items, ...order }: NewOrder): Promise<StoredOrder> {
    return this.prisma.order.create({
      data: { ...order, items: { create: items } },
      include: { items: true },
    });
  }
}
