import { randomInt } from 'node:crypto';

/** Characters an Order Reference is drawn from. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Number of characters in an Order Reference. */
const LENGTH = 6;

/** Shape of a reference in any letter case (ASCII only, so `ß` never upper-cases into one). */
const REFERENCE = /^[A-Za-z0-9]{6}$/;

/**
 * Guest-facing Order identifier: 6 chars `[A-Z0-9]` from a CSPRNG.
 * Uniqueness is enforced by the database; callers retry on a collision.
 */
export const OrderReference = {
  /** Returns a new random reference; `randomInt` draws without modulo bias. */
  generate(): string {
    let ref = '';
    for (let i = 0; i < LENGTH; i++)
      ref += ALPHABET[randomInt(ALPHABET.length)];
    return ref;
  },

  /** Returns `input` upper-cased, or `null` when it is not a reference in any letter case. */
  normalize(input: string): string | null {
    return REFERENCE.test(input) ? input.toUpperCase() : null;
  },
};
