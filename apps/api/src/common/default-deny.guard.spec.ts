import { describe, expect, it } from 'vitest';
import { PrincipalGuard } from './default-deny.guard';

/** Overrides `canActivate` with a class field (forbidden). */
class FieldOverrideGuard extends PrincipalGuard {
  /** Never called. */
  authenticate(): null {
    return null;
  }

  /** Would admit without setting a principal. */
  canActivate = (): Promise<boolean> => Promise.resolve(true);
}

describe('PrincipalGuard', () => {
  it('refuses a class-field canActivate override at construction', () => {
    expect(() => new FieldOverrideGuard()).toThrow(TypeError);
  });
});
