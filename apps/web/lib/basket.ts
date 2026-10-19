import {
  PlaceOrderItemSchema,
  ValidationIssueSchema,
  type MenuItem,
} from '@restaurant/shared';
import { z } from 'zod';
import type { ApiError } from './api';

/** Most of one Menu Item a basket line may hold, from the shared schema. */
export const MAX_QUANTITY = PlaceOrderItemSchema.shape.quantity.maxValue ?? 99;

/** Quantities by Menu Item id, in the order the lines were added. */
export type Basket = ReadonlyMap<string, number>;

/**
 * Returns a new basket with `id`'s quantity changed by `delta`, capped at
 * {@link MAX_QUANTITY}. A line that reaches 0 is removed.
 */
export function changeQuantity(
  basket: Basket,
  id: string,
  delta: number,
): Basket {
  const next = new Map(basket);
  const quantity = Math.min((basket.get(id) ?? 0) + delta, MAX_QUANTITY);
  if (quantity > 0) next.set(id, quantity);
  else next.delete(id);
  return next;
}

/**
 * Estimated total in cents from Menu prices. The server total is
 * authoritative. Lines whose Menu Item is unknown count as 0.
 */
export function basketTotalCents(
  basket: Basket,
  items: ReadonlyMap<string, MenuItem>,
): number {
  let total = 0;
  for (const [id, quantity] of basket) {
    total += (items.get(id)?.priceCents ?? 0) * quantity;
  }
  return total;
}

/** What the basket shows after a failed placement. */
export type SubmitError = {
  /** Inline text shown under the basket. */
  message: string;
  /** Set for `ORDER_ALREADY_OPEN`: the basket links to `/track`. */
  openOrder?: true;
};

/** `ORDER_ALREADY_OPEN` details: the open Order's reference. */
const OpenOrderDetailsSchema = z.object({ reference: z.string() });

/** Maps a place-order error to its inline message, by `code` only. */
export function describeSubmitError(error: ApiError): SubmitError {
  switch (error.code) {
    case 'VALIDATION_FAILED': {
      const issues = ValidationIssueSchema.array().safeParse(error.details);
      const detail = issues.success
        ? issues.data.map((issue) => issue.message).join('. ')
        : '';
      return { message: `Please check your Order. ${detail}`.trim() };
    }
    case 'MENU_ITEM_NOT_FOUND':
      return {
        message:
          'A dish in your basket is no longer on the Menu. Refresh the page and try again.',
      };
    case 'ORDER_ALREADY_OPEN': {
      const details = OpenOrderDetailsSchema.safeParse(error.details);
      return {
        message: details.success
          ? `You already have an open Order (${details.data.reference}).`
          : 'You already have an open Order.',
        openOrder: true,
      };
    }
    default:
      return { message: 'Something went wrong. Please try again.' };
  }
}
