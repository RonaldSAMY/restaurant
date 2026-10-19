import type { KitchenOrder } from '@restaurant/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { applyAdvanced, Board, nextStatus } from './kitchen-board';
import { describeLoginError } from './login/login-form';
import KitchenLoginPage from './login/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

/** A Kitchen Order with the given id, reference and status. */
function order(
  id: string,
  reference: string,
  status: KitchenOrder['status'],
): KitchenOrder {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    reference,
    guestName: `Guest ${reference}`,
    status,
    items: [
      { name: 'Burger', quantity: 2, unitPriceCents: 1450 },
      { name: 'Soup', quantity: 1, unitPriceCents: 650 },
    ],
    totalCents: 3550,
    placedAt: '2026-10-19T12:05:00.000Z',
  };
}

/** The markup of the column whose heading is `label`. */
function column(html: string, label: string): string {
  const start = html.indexOf(`>${label}</h2>`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}

describe('Board', () => {
  const orders = [
    order('1', 'AAAAA1', 'RECEIVED'),
    order('2', 'BBBBB2', 'PREPARING'),
    order('3', 'CCCCC3', 'READY'),
    order('4', 'DDDDD4', 'RECEIVED'),
  ];
  const html = renderToStaticMarkup(
    <Board
      orders={orders}
      pending={new Set([orders[3].id])}
      onAdvance={() => {}}
    />,
  );

  it('places each Order in its column, in api order, with its action', () => {
    const received = column(html, 'Received');
    expect(received.indexOf('AAAAA1')).toBeLessThan(received.indexOf('DDDDD4'));
    expect(received).toContain('Take');
    expect(received).not.toContain('BBBBB2');
    expect(column(html, 'Preparing')).toContain('BBBBB2');
    expect(column(html, 'Preparing')).toContain('Mark Ready');
    expect(column(html, 'Ready')).toContain('CCCCC3');
    expect(column(html, 'Ready')).toContain('Mark Collected');
  });

  it('shows the Guest name, lines and local time placed', () => {
    const date = new Date('2026-10-19T12:05:00.000Z');
    const time = [date.getHours(), date.getMinutes()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    for (const text of ['Guest AAAAA1', '2 × Burger', '1 × Soup', `>${time}<`])
      expect(html).toContain(text);
  });

  it('disables only the pending card action', () => {
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    const start = html.indexOf('DDDDD4');
    // The card's own </li> is the first one after its items list closes.
    const end = html.indexOf('</li>', html.indexOf('</ul>', start));
    expect(html.slice(start, end)).toMatch(/<button[^>]*disabled=""/);
  });

  it('labels each action with its reference', () => {
    expect(html).toContain('aria-label="Take AAAAA1"');
    expect(html).toContain('aria-label="Mark Ready BBBBB2"');
    expect(html).toContain('aria-label="Mark Collected CCCCC3"');
  });

  it('says No Orders in an empty column', () => {
    expect(html).not.toContain('No Orders');
    const sparse = renderToStaticMarkup(
      <Board orders={[orders[0]]} pending={new Set()} onAdvance={() => {}} />,
    );
    expect(column(sparse, 'Received')).not.toContain('No Orders');
    expect(column(sparse, 'Preparing')).toContain('No Orders');
    expect(column(sparse, 'Ready')).toContain('No Orders');
  });
});

describe('nextStatus', () => {
  it.each([
    ['RECEIVED', 'PREPARING'],
    ['PREPARING', 'READY'],
    ['READY', 'COLLECTED'],
    ['COLLECTED', null],
  ] as const)('%s → %s', (from, to) => {
    expect(nextStatus(from)).toBe(to);
  });
});

describe('applyAdvanced', () => {
  const a = order('1', 'AAAAA1', 'RECEIVED');
  const b = order('2', 'BBBBB2', 'READY');

  it('moves a taken Order into Preparing', () => {
    const taken = { ...a, status: 'PREPARING' as const };
    expect(applyAdvanced([a, b], taken)).toEqual([taken, b]);
  });

  it('removes a collected Order', () => {
    expect(applyAdvanced([a, b], { ...b, status: 'COLLECTED' })).toEqual([a]);
  });
});

describe('describeLoginError', () => {
  it.each([
    ['INVALID_CREDENTIALS', 'Email or password is incorrect.'],
    ['VALIDATION_FAILED', 'Email or password is incorrect.'],
    ['RATE_LIMITED', 'Too many attempts. Please try again shortly.'],
    ['INTERNAL', 'Something went wrong. Please try again.'],
  ] as const)('maps %s', (code, text) => {
    expect(describeLoginError({ code, message: 'x' })).toBe(text);
  });
});

describe('KitchenLoginPage', () => {
  it('renders the email and password form', () => {
    const html = renderToStaticMarkup(<KitchenLoginPage />);
    expect(html).toContain('Kitchen login');
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/type="password"/);
    expect(html).toContain('Log in');
  });
});
