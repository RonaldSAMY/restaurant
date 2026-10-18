import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv (api)', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@postgres:5432/db');
    vi.stubEnv('REDIS_URL', 'redis://redis:6379');
    vi.stubEnv('PORT', '3000');
  });

  it('parses a valid env, coercing PORT to a number', () => {
    expect(parseEnv()).toEqual({
      DATABASE_URL: 'postgresql://u:p@postgres:5432/db',
      REDIS_URL: 'redis://redis:6379',
      PORT: 3000,
    });
  });

  it.each([
    ['DATABASE_URL', 'missing', undefined],
    ['DATABASE_URL', 'not a URL', 'not-a-url'],
    ['REDIS_URL', 'missing', undefined],
    ['PORT', 'missing', undefined],
    ['PORT', 'not numeric', 'abc'],
    ['PORT', 'negative', '-1'],
  ])('logs and exits 1 when %s is %s', (name, _case, value) => {
    vi.stubEnv(name, value);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseEnv()).toThrow('process.exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(name));
  });
});
