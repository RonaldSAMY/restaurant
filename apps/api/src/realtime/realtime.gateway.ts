import { applyDecorators, Logger, UseFilters, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  OrderSubscribeRequestSchema,
  SOCKET_PATH,
  SocketEvents,
  type SubscribeAck,
} from '@restaurant/shared';
import { ZodValidationException } from 'nestjs-zod';
import type { Server, Socket } from 'socket.io';
import { AuthSessionService } from '../auth/auth-session.service';
import { ACCESS_COOKIE } from '../auth/staff-auth.guard';
import { readCookie } from '../common/cookies';
import { DefaultDenyGuard } from '../common/default-deny.guard';
import { loggableStack } from '../common/error-envelope.filter';
import { Public } from '../common/public.decorator';
import { Rooms, SocketServerRef } from '../common/socket-server.ref';
import { GUEST_SESSION_COOKIE } from '../orders/guest-session.guard';
import { GuestSessionService } from '../orders/guest-session.service';
import { REFERENCE_LOOKUP_THROTTLE } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { WsAckFilter } from './ws-ack.filter';
import { WsThrottlerGuard } from './ws-throttler.guard';

/**
 * Declares a Socket.IO gateway at {@link SOCKET_PATH} with the api's
 * conventions. `APP_GUARD` does not reach gateways, so default deny is applied
 * here; every gateway must use this instead of `@WebSocketGateway`.
 */
export const Gateway = (): ClassDecorator =>
  applyDecorators(
    WebSocketGateway({ path: SOCKET_PATH }),
    UseGuards(DefaultDenyGuard),
    UseFilters(WsAckFilter),
  );

/** Whether the handshake declares a staff client (`auth: { staff: true }`). */
function wantsStaff(auth: unknown): boolean {
  return (
    typeof auth === 'object' &&
    auth !== null &&
    (auth as { staff?: unknown }).staff === true
  );
}

/**
 * Live Order updates. The handshake assigns rooms from cookies (clients never
 * name one): an open Guest Session joins `order:{orderId}`; a client that
 * declares `staff: true` joins `kitchen` and `staff-session:{sid}` with a
 * valid access cookie, or is refused with `UNAUTHENTICATED`. Events are sent
 * by `OrderEventsPublisher`, never from here.
 */
@Gateway()
export class RealtimeGateway implements OnGatewayInit<Server> {
  /** Logs handshake failures that are not auth refusals. */
  private readonly logger = new Logger(RealtimeGateway.name);

  /** Receives the server holder, both session resolvers and the Orders service. */
  constructor(
    private readonly sockets: SocketServerRef,
    private readonly staffSessions: AuthSessionService,
    private readonly guestSessions: GuestSessionService,
    private readonly orders: OrdersService,
  ) {}

  /** Publishes the server and installs the room-assigning handshake. */
  afterInit(server: Server): void {
    this.sockets.server = server;
    server.use((socket, next) => {
      this.admit(socket).then(
        () => next(),
        (error: unknown) => {
          if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
            return next(error);
          }
          // Never send driver text (Redis/Prisma) to the client.
          this.logger.error(
            error instanceof Error
              ? loggableStack(error)
              : `Handshake failed: non-Error ${typeof error}`,
          );
          next(new Error('INTERNAL'));
        },
      );
    });
  }

  /**
   * Follows the Order with `reference` (same rule and 404 as the HTTP lookup)
   * by joining `order:{id}`; acks `{ ok: true }`.
   */
  @Public()
  @UseGuards(WsThrottlerGuard)
  @Throttle(REFERENCE_LOOKUP_THROTTLE)
  @SubscribeMessage(SocketEvents.orderSubscribe)
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    const parsed = OrderSubscribeRequestSchema.safeParse(body);
    if (!parsed.success) throw new ZodValidationException(parsed.error);
    const id = await this.orders.idByReference(parsed.data.reference);
    await client.join(Rooms.order(id));
    return { ok: true };
  }

  /** Joins the rooms the handshake cookies entitle `socket` to; throws `UNAUTHENTICATED` for stale staff. */
  private async admit(socket: Socket): Promise<void> {
    const { cookie } = socket.handshake.headers;
    const rooms: string[] = [];
    const guest = await this.guestSessions.resolve(
      readCookie(cookie, GUEST_SESSION_COOKIE),
    );
    if (guest) rooms.push(Rooms.order(guest.order.id));
    if (wantsStaff(socket.handshake.auth)) {
      const claims = await this.staffSessions.resolve(
        readCookie(cookie, ACCESS_COOKIE),
      );
      if (!claims) throw new Error('UNAUTHENTICATED');
      rooms.push(Rooms.kitchen, Rooms.staffSession(claims.sid));
    }
    await socket.join(rooms);
  }
}
