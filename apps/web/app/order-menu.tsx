'use client';

import { PlaceOrderRequestSchema, type MenuCategory } from '@restaurant/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { placeOrder } from '../lib/api';
import {
  basketTotalCents,
  changeQuantity,
  describeSubmitError,
  MAX_QUANTITY,
  type Basket,
  type SubmitError,
} from '../lib/basket';
import { formatPrice } from '../lib/menu';

/** Longest guest name the shared schema accepts. */
const NAME_MAX_LENGTH =
  PlaceOrderRequestSchema.shape.guestName.maxLength ?? undefined;

/**
 * The Menu with add buttons, plus the basket form that places the Order and
 * navigates to `/track`.
 */
export function OrderMenu({ categories }: { categories: MenuCategory[] }) {
  const router = useRouter();
  const [basket, setBasket] = useState<Basket>(() => new Map());
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const itemsById = useMemo(
    () =>
      new Map(
        categories.flatMap((c) => c.items.map((i) => [i.id, i] as const)),
      ),
    [categories],
  );
  const order = PlaceOrderRequestSchema.safeParse({
    guestName,
    items: [...basket].map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    })),
  });

  /** Changes one basket line by `delta` (see {@link changeQuantity}). */
  function change(id: string, delta: number) {
    setBasket((current) => changeQuantity(current, id, delta));
    setError(null);
  }

  /** Places the Order; navigates on success, shows the inline error otherwise. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order.success || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await placeOrder(order.data);
    if (result.ok) {
      // Stays "submitting" so the form cannot be sent twice while navigating.
      router.push('/track');
      return;
    }
    setError(describeSubmitError(result.error));
    setSubmitting(false);
  }

  return (
    <>
      {categories.map((category) => (
        <section key={category.name}>
          <h2>{category.name}</h2>
          <ul className="items">
            {category.items.map((item) => (
              <li key={item.id}>
                <div className="item-row">
                  <span className="item-name">{item.name}</span>
                  <span className="item-price">
                    {formatPrice(item.priceCents)}
                  </span>
                </div>
                <p className="item-description">{item.description}</p>
                {basket.has(item.id) ? (
                  <QuantityStepper
                    name={item.name}
                    quantity={basket.get(item.id) ?? 0}
                    onChange={(delta) => change(item.id, delta)}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Add ${item.name}`}
                    onClick={() => change(item.id, 1)}
                  >
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form
        className="basket"
        onSubmit={(event) => void submit(event)}
        aria-labelledby="basket"
      >
        <h2 id="basket">Your Order</h2>
        {basket.size === 0 ? (
          <p>Your basket is empty.</p>
        ) : (
          <ul className="items">
            {[...basket].map(([id, quantity]) => {
              const item = itemsById.get(id);
              if (!item) return null;
              return (
                <li key={id} className="basket-line">
                  <span className="item-name">{item.name}</span>
                  <QuantityStepper
                    name={item.name}
                    quantity={quantity}
                    onChange={(delta) => change(id, delta)}
                  />
                  <span className="item-price">
                    {formatPrice(item.priceCents * quantity)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="item-row basket-total">
          <span>Estimated total</span>
          <span className="item-price">
            {formatPrice(basketTotalCents(basket, itemsById))}
          </span>
        </p>
        <label htmlFor="guest-name">Your name</label>
        <input
          id="guest-name"
          name="guestName"
          autoComplete="given-name"
          required
          maxLength={NAME_MAX_LENGTH}
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
        />
        <p role="alert" className="error">
          {error?.message}
          {error?.openOrder && (
            <>
              {' '}
              <Link href="/track">View your Order</Link>
            </>
          )}
        </p>
        {!order.success && (
          <p className="hint">Add a dish and enter your name to order.</p>
        )}
        <button type="submit" disabled={!order.success || submitting}>
          {submitting ? 'Placing Order…' : 'Place Order'}
        </button>
      </form>
    </>
  );
}

/**
 * `−` / quantity / `+` controls for one basket line. The quantity is an
 * `output`, so screen readers announce changes.
 */
function QuantityStepper({
  name,
  quantity,
  onChange,
}: {
  name: string;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <span className="quantity">
      <button
        type="button"
        aria-label={`Remove one ${name}`}
        onClick={() => onChange(-1)}
      >
        −
      </button>
      <output aria-label={`${name} quantity`}>{quantity}</output>
      <button
        type="button"
        aria-label={`Add one ${name}`}
        disabled={quantity >= MAX_QUANTITY}
        onClick={() => onChange(1)}
      >
        +
      </button>
    </span>
  );
}
