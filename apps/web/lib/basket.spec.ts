import { describe, expect, it } from 'vitest';
import {
  basketTotalCents,
  changeQuantity,
  describeSubmitError,
  MAX_QUANTITY,
} from './basket';

/** A Menu Item at €14.50. */
const burger = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Burger',
  description: 'Beef',
  priceCents: 1450,
};
/** A Menu Item at €6.50. */
const soup = {
  ...burger,
  id: '00000000-0000-4000-8000-000000000002',
  priceCents: 650,
};

describe('changeQuantity', () => {
  it('adds, increments and removes a line at 0', () => {
    let basket = changeQuantity(new Map(), burger.id, 1);
    basket = changeQuantity(basket, burger.id, 1);
    expect(basket.get(burger.id)).toBe(2);
    basket = changeQuantity(
      changeQuantity(basket, burger.id, -1),
      burger.id,
      -1,
    );
    expect(basket.has(burger.id)).toBe(false);
  });

  it('caps a line at the shared max quantity', () => {
    expect(MAX_QUANTITY).toBe(99);
    const basket = changeQuantity(new Map([[burger.id, 99]]), burger.id, 1);
    expect(basket.get(burger.id)).toBe(99);
  });

  it('does not mutate the given basket', () => {
    const basket = new Map([[burger.id, 1]]);
    changeQuantity(basket, burger.id, 1);
    expect(basket.get(burger.id)).toBe(1);
  });
});

describe('basketTotalCents', () => {
  it('sums price × quantity from Menu prices', () => {
    const items = new Map([
      [burger.id, burger],
      [soup.id, soup],
    ]);
    const basket = new Map([
      [burger.id, 2],
      [soup.id, 1],
    ]);
    expect(basketTotalCents(basket, items)).toBe(3550);
  });

  it('counts a line with an unknown Menu Item as 0', () => {
    const basket = new Map([[burger.id, 2]]);
    expect(basketTotalCents(basket, new Map())).toBe(0);
  });
});

describe('describeSubmitError', () => {
  it('lists validation issue messages', () => {
    expect(
      describeSubmitError({
        code: 'VALIDATION_FAILED',
        message: 'ignored',
        details: [{ path: 'items', message: 'Too many' }],
      }),
    ).toEqual({ message: 'Please check your Order. Too many' });
  });

  it('explains an unknown Menu Item', () => {
    expect(
      describeSubmitError({ code: 'MENU_ITEM_NOT_FOUND', message: 'x' })
        .message,
    ).toContain('no longer on the Menu');
  });

  it('links to the open Order with its reference', () => {
    expect(
      describeSubmitError({
        code: 'ORDER_ALREADY_OPEN',
        message: 'x',
        details: { reference: 'AB12CD' },
      }),
    ).toEqual({
      message: 'You already have an open Order (AB12CD).',
      openOrder: true,
    });
  });

  it('still links to the open Order when details are missing', () => {
    expect(
      describeSubmitError({ code: 'ORDER_ALREADY_OPEN', message: 'x' }),
    ).toEqual({ message: 'You already have an open Order.', openOrder: true });
  });

  it('falls back to a generic message for other codes', () => {
    expect(
      describeSubmitError({ code: 'INTERNAL', message: 'boom' }).message,
    ).toBe('Something went wrong. Please try again.');
  });
});
