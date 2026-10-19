import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { describeLookupError, OrderView } from './order-view';
import TrackPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

/** A Guest view with two lines. */
const order = {
  reference: 'AB12CD',
  guestName: 'Ana',
  status: 'PREPARING',
  items: [
    { name: 'Burger', quantity: 2, unitPriceCents: 1450 },
    { name: 'Soup', quantity: 1, unitPriceCents: 650 },
  ],
  totalCents: 3550,
  placedAt: '2026-10-19T12:00:00.000Z',
} as const;

describe('OrderView', () => {
  it('shows status, reference, name, line totals and total', () => {
    const html = renderToStaticMarkup(
      <OrderView order={{ ...order, items: [...order.items] }} />,
    );
    expect(html).toMatch(/class="order-status">Preparing</);
    for (const text of [
      'AB12CD',
      'Ana',
      '2 × Burger',
      '€29.00',
      '1 × Soup',
      '€6.50',
      '€35.50',
    ]) {
      expect(html).toContain(text);
    }
  });
});

describe('describeLookupError', () => {
  it.each([
    ['ORDER_NOT_FOUND', 'Order not found'],
    ['RATE_LIMITED', 'try again shortly'],
    ['INTERNAL', 'Something went wrong'],
  ] as const)('maps %s', (code, text) => {
    expect(describeLookupError({ code, message: 'x' })).toContain(text);
  });
});

describe('TrackPage', () => {
  it('renders loading plus the lookup form before the Order loads', () => {
    const html = renderToStaticMarkup(<TrackPage />);
    expect(html).toContain('Loading your Order');
    expect(html).toContain('Track an Order by reference');
  });
});
