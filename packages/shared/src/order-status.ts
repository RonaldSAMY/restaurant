import { z } from 'zod';

/** Lifecycle of an Order, from placement to pickup. */
export const OrderStatusSchema = z.enum([
  'RECEIVED',
  'PREPARING',
  'READY',
  'COLLECTED',
]);

/** One step of the Order lifecycle (see {@link OrderStatusSchema}). */
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
