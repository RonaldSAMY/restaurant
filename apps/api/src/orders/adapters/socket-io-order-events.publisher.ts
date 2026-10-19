import { Injectable } from '@nestjs/common';
import {
  type KitchenOrder,
  type KitchenStatusChanged,
  SocketEvents,
} from '@restaurant/shared';
import { Rooms, SocketServerRef } from '../../common/socket-server.ref';
import { OrderEventsPublisher } from '../ports/order-events-publisher';

/**
 * Socket.IO adapter of {@link OrderEventsPublisher}: emits to the rooms the
 * gateway assigned. No-ops while no gateway has set the server.
 */
@Injectable()
export class SocketIoOrderEventsPublisher extends OrderEventsPublisher {
  /** Receives the server holder. */
  constructor(private readonly sockets: SocketServerRef) {
    super();
  }

  /** Emits `order.created` to `kitchen`. */
  orderCreated(order: KitchenOrder): void {
    this.sockets.server
      ?.to(Rooms.kitchen)
      .emit(SocketEvents.orderCreated, order);
  }

  /** Emits `order.status-changed` to `kitchen` with `id`, to `order:{id}` without. */
  statusChanged({ id, ...guest }: KitchenStatusChanged): void {
    const server = this.sockets.server;
    if (!server) return;
    server
      .to(Rooms.kitchen)
      .emit(SocketEvents.orderStatusChanged, { id, ...guest });
    server.to(Rooms.order(id)).emit(SocketEvents.orderStatusChanged, guest);
  }
}
