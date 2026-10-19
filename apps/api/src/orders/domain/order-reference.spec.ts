import { describe, expect, it } from 'vitest';
import { OrderReference } from './order-reference';

describe('OrderReference.generate', () => {
  const draws = Array.from({ length: 10_000 }, () => OrderReference.generate());

  it('returns 6 chars of [A-Z0-9]', () => {
    for (const ref of draws) expect(ref).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('uses the whole alphabet', () => {
    const seen = new Set(draws.join(''));
    expect(seen.size).toBe(36);
  });

  it('rarely repeats', () => {
    // 36^6 ≈ 2.2e9 values; 10k draws collide with p ≈ 2%, so allow a couple.
    expect(new Set(draws).size).toBeGreaterThanOrEqual(draws.length - 2);
  });
});

describe('OrderReference.normalize', () => {
  it('upper-cases a reference in any letter case', () => {
    expect(OrderReference.normalize('ab12Cd')).toBe('AB12CD');
  });

  it.each(['', 'ABC12', 'ABC1234', 'AB-12C', 'abcdß', 'ÄBC123'])(
    'rejects %j',
    (input) => {
      expect(OrderReference.normalize(input)).toBeNull();
    },
  );
});
