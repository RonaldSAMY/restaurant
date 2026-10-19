import { z } from 'zod';
import { ErrorEnvelopeSchema } from './errors';
import { OrderStatusSchema } from './order-status';

/** Socket.IO path, behind the same `/api` proxy route as the HTTP api. */
export const SOCKET_PATH = '/api/socket.io';

/** Socket.IO event names (server → client, and the one client → server message). */
export const SocketEvents = {
  /** Server → `kitchen`: a new Order ({@link KitchenOrder}). */
  orderCreated: 'order.created',
  /** Server → `kitchen` (with `id`) and `order:{id}` (without). */
  orderStatusChanged: 'order.status-changed',
  /** Client → server: follow an Order by reference; acked with {@link SubscribeAck}. */
  orderSubscribe: 'order.subscribe',
} as const;

/** Guest-facing status change: no internal Order id. */
export const GuestStatusChangedSchema = z.object({
  reference: z.string(),
  status: OrderStatusSchema,
  changedAt: z.iso.datetime(),
});

/** Parsed guest status change (see {@link GuestStatusChangedSchema}). */
export type GuestStatusChanged = z.infer<typeof GuestStatusChangedSchema>;

/** Kitchen-facing status change: the guest event plus the Order id. */
export const KitchenStatusChangedSchema = GuestStatusChangedSchema.extend({
  id: z.uuid(),
});

/** Parsed kitchen status change (see {@link KitchenStatusChangedSchema}). */
export type KitchenStatusChanged = z.infer<typeof KitchenStatusChangedSchema>;

/** Body of `order.subscribe`. */
export const OrderSubscribeRequestSchema = z.object({ reference: z.string() });

/** Parsed subscribe body (see {@link OrderSubscribeRequestSchema}). */
export type OrderSubscribeRequest = z.infer<typeof OrderSubscribeRequestSchema>;

/** Ack of `order.subscribe`: `{ ok: true }` or an error envelope. */
export const SubscribeAckSchema = z.union([
  z.object({ ok: z.literal(true) }),
  ErrorEnvelopeSchema,
]);

/** Parsed subscribe ack (see {@link SubscribeAckSchema}). */
export type SubscribeAck = z.infer<typeof SubscribeAckSchema>;
