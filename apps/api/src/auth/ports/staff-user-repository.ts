/** A Kitchen Staff account as stored. */
export interface StaffUser {
  /** Internal UUID. */
  id: string;
  /** Trimmed, lower-cased login email. */
  email: string;
  /** argon2id PHC string; never logged or returned. */
  passwordHash: string;
}

/** Persistence port for staff accounts (ports-and-adapters). */
export abstract class StaffUserRepository {
  /** Returns the account with this (normalized) email, or `null`. */
  abstract findByEmail(email: string): Promise<StaffUser | null>;

  /** Returns the account with this id, or `null`. */
  abstract findById(id: string): Promise<StaffUser | null>;
}
