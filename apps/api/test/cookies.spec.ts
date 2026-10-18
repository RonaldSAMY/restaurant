import { describe, expect, it } from 'vitest';
import { cookieHeader } from './cookies';

describe('cookieHeader', () => {
  it('joins name=value pairs and drops attributes', () => {
    const res = {
      headers: {
        'set-cookie': [
          'a=1; Path=/; HttpOnly; SameSite=Lax',
          'b=2; Max-Age=60; Secure',
        ],
      },
    };
    expect(cookieHeader(res)).toBe('a=1; b=2');
  });

  it('accepts a single header string', () => {
    expect(cookieHeader({ headers: { 'set-cookie': 'a=1; Path=/' } })).toBe(
      'a=1',
    );
  });

  it('returns an empty string without Set-Cookie', () => {
    expect(cookieHeader({ headers: {} })).toBe('');
  });
});
