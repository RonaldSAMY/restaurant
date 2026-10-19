import { type ArgumentsHost, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from './domain-error';
import { ErrorEnvelopeFilter } from './error-envelope.filter';

describe('ErrorEnvelopeFilter on a non-HTTP host', () => {
  const wsHost = {
    getType: () => 'ws',
    switchToHttp: () => {
      throw new Error('switchToHttp must not be called');
    },
  } as unknown as ArgumentsHost;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Spies on (and silences) the filter's error log. */
  const spyLog = () =>
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  it('writes no response and logs nothing for an expected error', () => {
    const logged = spyLog();
    expect(() =>
      new ErrorEnvelopeFilter().catch(
        new DomainError('FORBIDDEN', 'No'),
        wsHost,
      ),
    ).not.toThrow();
    expect(logged).not.toHaveBeenCalled();
  });

  it('still logs an unexpected error', () => {
    const logged = spyLog();
    new ErrorEnvelopeFilter().catch(new Error('ws boom'), wsHost);
    expect(JSON.stringify(logged.mock.calls)).toContain('ws boom');
  });
});
