import { z } from 'zod';
import { OrderStatusSchema } from './order-status';

/** One requested line: a Menu Item and how many. Unknown keys are stripped. */
export const PlaceOrderItemSchema = z.object({
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
});

/** Body of `POST /api/v1/orders`. Prices are never taken from the client. */
export const PlaceOrderRequestSchema = z.object({
  guestName: z.string().trim().min(1).max(60),
  items: z.array(PlaceOrderItemSchema).min(1).max(50),
});

/** Parsed place-order body (see {@link PlaceOrderRequestSchema}). */
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequestSchema>;

/** One Order line as the Guest sees it: name and price snapshots, in cents. */
export const GuestOrderItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

/**
 * An Order as shown to its Guest. Never carries the internal Order UUID;
 * `placedAt` is an ISO-8601 UTC string.
 */
export const GuestOrderViewSchema = z.object({
  reference: z.string().regex(/^[A-Z0-9]{6}$/),
  guestName: z.string(),
  status: OrderStatusSchema,
  items: z.array(GuestOrderItemSchema),
  totalCents: z.number().int().nonnegative(),
  placedAt: z.iso.datetime(),
});

/** Guest-facing Order (see {@link GuestOrderViewSchema}). */
export type GuestOrderView = z.infer<typeof GuestOrderViewSchema>;

/** An Order as shown on the Kitchen Board: the Guest view plus its internal id. */
export const KitchenOrderSchema = GuestOrderViewSchema.extend({ id: z.uuid() });

/** Staff-facing Order (see {@link KitchenOrderSchema}). */
export type KitchenOrder = z.infer<typeof KitchenOrderSchema>;

/** Body of `PATCH /api/v1/kitchen/orders/:id/status`: the requested next status. */
export const AdvanceStatusRequestSchema = z.object({ to: OrderStatusSchema });

/** Parsed advance-status body (see {@link AdvanceStatusRequestSchema}). */
export type AdvanceStatusRequest = z.infer<typeof AdvanceStatusRequestSchema>;
