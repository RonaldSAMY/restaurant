import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv (web)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('parses a valid env', () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:3000');
    expect(parseEnv()).toEqual({ API_INTERNAL_URL: 'http://api:3000' });
  });

  it.each([
    ['missing', undefined],
    ['not a URL', 'not-a-url'],
  ])('logs and exits 1 when API_INTERNAL_URL is %s', (_case, value) => {
    vi.stubEnv('API_INTERNAL_URL', value);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseEnv()).toThrow('process.exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('API_INTERNAL_URL'),
    );
  });
});
