import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PasswordHasher } from '../ports/password-hasher';

/** {@link PasswordHasher} using argon2id with the library's default cost. */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  /** Hashes `password` with argon2id and a random salt. */
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /** Checks `password` against an argon2 PHC string. */
  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
