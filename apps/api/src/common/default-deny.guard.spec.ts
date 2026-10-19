import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { describe, expect, it } from 'vitest';
import { type Principal, PrincipalGuard } from './default-deny.guard';

/** Overrides `canActivate` with a class field (forbidden). */
class FieldOverrideGuard extends PrincipalGuard {
  /** Never called. */
  authenticate(): null {
    return null;
  }

  /** Would admit without setting a principal. */
  canActivate = (): Promise<boolean> => Promise.resolve(true);
}

/** Admits everyone as one fixed staff principal. */
class FixedGuard extends PrincipalGuard {
  /** The principal it resolves. */
  static readonly principal: Principal = {
    kind: 'staff',
    staffId: 'staff-1',
    sid: 'sid-1',
  };

  /** Returns {@link FixedGuard.principal}. */
  authenticate(): Principal {
    return FixedGuard.principal;
  }
}

describe('PrincipalGuard', () => {
  it('refuses a class-field canActivate override at construction', () => {
    expect(() => new FieldOverrideGuard()).toThrow(TypeError);
  });

  it('sets req.principal on HTTP', async () => {
    const req: { principal?: Principal } = {};
    const context = new ExecutionContextHost([req, {}]);
    await expect(new FixedGuard().canActivate(context)).resolves.toBe(true);
    expect(req.principal).toEqual(FixedGuard.principal);
  });

  it('sets client.data.principal on ws', async () => {
    const client = { data: {} as { principal?: Principal } };
    const context = new ExecutionContextHost([client, {}]);
    context.setType('ws');
    await expect(new FixedGuard().canActivate(context)).resolves.toBe(true);
    expect(client.data.principal).toEqual(FixedGuard.principal);
  });
});
