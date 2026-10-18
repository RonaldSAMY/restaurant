import { describe, expect, it } from 'vitest';
import { FakeClock, SystemClock } from './clock';

describe('FakeClock', () => {
  const t0 = new Date('2026-01-01T12:00:00.000Z');

  it('starts at the given time', () => {
    expect(new FakeClock(t0).now()).toEqual(t0);
  });

  it('advances by milliseconds', () => {
    const clock = new FakeClock(t0);
    clock.advance(60_000);
    expect(clock.now()).toEqual(new Date(t0.getTime() + 60_000));
  });

  it('jumps to a set date', () => {
    const clock = new FakeClock(t0);
    const later = new Date('2027-06-01T00:00:00.000Z');
    clock.set(later);
    expect(clock.now()).toEqual(later);
  });

  it('returns copies callers cannot mutate', () => {
    const clock = new FakeClock(t0);
    clock.now().setTime(0);
    expect(clock.now()).toEqual(t0);
  });
});

describe('SystemClock', () => {
  it('returns the system time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
