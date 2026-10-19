import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies';

describe('readCookie', () => {
  it('returns undefined without a header', () => {
    expect(readCookie(undefined, 'a')).toBeUndefined();
    expect(readCookie('', 'a')).toBeUndefined();
  });

  it('finds the named cookie among several', () => {
    expect(readCookie('a=1; guest_session=abc; b=2', 'guest_session')).toBe(
      'abc',
    );
    expect(readCookie('a=1;b=2', 'b')).toBe('2');
  });

  it('returns undefined for an absent name', () => {
    expect(readCookie('a=1; b=2', 'c')).toBeUndefined();
    expect(readCookie('xa=1; ax=2', 'a')).toBeUndefined();
  });

  it('keeps "=" inside the value', () => {
    expect(readCookie('a=x=y', 'a')).toBe('x=y');
  });
});
