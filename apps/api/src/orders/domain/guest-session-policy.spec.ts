import { describe, expect, it } from 'vitest';
import { GUEST_SESSION_MS, GuestSessionPolicy } from './guest-session-policy';

describe('GuestSessionPolicy', () => {
  const placedAt = new Date('2026-10-19T12:00:00.000Z');
  const at = (ms: number) => new Date(placedAt.getTime() + ms);

  it('is open until just before placedAt + 24 h', () => {
    const order = { status: 'READY' as const, placedAt };
    expect(GuestSessionPolicy.isOpen(order, at(GUEST_SESSION_MS - 1))).toBe(
      true,
    );
    expect(GuestSessionPolicy.isOpen(order, at(GUEST_SESSION_MS))).toBe(false);
  });

  it('is closed once Collected', () => {
    expect(
      GuestSessionPolicy.isOpen({ status: 'COLLECTED', placedAt }, placedAt),
    ).toBe(false);
  });

  it('generates well-formed ids and rejects malformed ones', () => {
    const sid = GuestSessionPolicy.newSessionId();
    expect(GuestSessionPolicy.isSessionId(sid)).toBe(true);
    expect(GuestSessionPolicy.isSessionId(sid.toUpperCase())).toBe(false);
    expect(GuestSessionPolicy.isSessionId(sid.slice(1))).toBe(false);
    expect(GuestSessionPolicy.isSessionId(undefined)).toBe(false);
  });
});
