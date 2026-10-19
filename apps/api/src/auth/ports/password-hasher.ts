/** Password hashing port (ports-and-adapters). */
export abstract class PasswordHasher {
  /** Returns a self-describing hash (PHC string) of `password`. */
  abstract hash(password: string): Promise<string>;

  /** Whether `password` matches `hash`. */
  abstract verify(hash: string, password: string): Promise<boolean>;
}
