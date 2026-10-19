import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv, SeedEnvSchema } from './env';

/** A valid (32-char) JWT secret. */
const SECRET = 'x'.repeat(32);

/** Makes `process.exit` throw and silences `console.error`. */
function trapExit() {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { exit, error };
}

describe('parseEnv (api)', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@postgres:5432/db');
    vi.stubEnv('REDIS_URL', 'redis://redis:6379');
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('AUTH_JWT_SECRET', SECRET);
  });

  it('parses a valid env, coercing PORT to a number', () => {
    expect(parseEnv()).toEqual({
      DATABASE_URL: 'postgresql://u:p@postgres:5432/db',
      REDIS_URL: 'redis://redis:6379',
      PORT: 3000,
      AUTH_JWT_SECRET: SECRET,
    });
  });

  it.each([
    ['DATABASE_URL', 'missing', undefined],
    ['DATABASE_URL', 'not a URL', 'not-a-url'],
    ['REDIS_URL', 'missing', undefined],
    ['PORT', 'missing', undefined],
    ['PORT', 'not numeric', 'abc'],
    ['PORT', 'negative', '-1'],
    ['AUTH_JWT_SECRET', 'missing', undefined],
    ['AUTH_JWT_SECRET', 'shorter than 32', 'x'.repeat(31)],
  ])('logs and exits 1 when %s is %s', (name, _case, value) => {
    vi.stubEnv(name, value);
    const { exit, error } = trapExit();

    expect(() => parseEnv()).toThrow('process.exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(name));
  });

  describe('with SeedEnvSchema', () => {
    beforeEach(() => {
      vi.stubEnv('SEED_STAFF_EMAIL', '  Chef@Example.COM ');
      vi.stubEnv('SEED_STAFF_PASSWORD', 'a-long-password');
    });

    it('normalizes the staff email', () => {
      expect(parseEnv(SeedEnvSchema)).toMatchObject({
        AUTH_JWT_SECRET: SECRET,
        SEED_STAFF_EMAIL: 'chef@example.com',
        SEED_STAFF_PASSWORD: 'a-long-password',
      });
    });

    it.each([
      ['SEED_STAFF_EMAIL', 'missing', undefined],
      ['SEED_STAFF_EMAIL', 'not an email', 'chef'],
      ['SEED_STAFF_PASSWORD', 'missing', undefined],
      ['SEED_STAFF_PASSWORD', 'shorter than 12', 'x'.repeat(11)],
    ])('logs and exits 1 when %s is %s', (name, _case, value) => {
      vi.stubEnv(name, value);
      const { exit, error } = trapExit();

      expect(() => parseEnv(SeedEnvSchema)).toThrow('process.exit');
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining(name));
    });
  });
});
