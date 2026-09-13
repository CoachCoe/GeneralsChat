import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * How a password is generated and hashed, in one place.
 *
 * The cost factor is load-bearing beyond the hash itself: `src/auth.ts`
 * compares against a dummy hash of the same cost so that the response time does
 * not reveal whether an address has an account. When the two drift, the branch
 * that exists to hide which accounts exist becomes the fast path and is a
 * cleaner enumeration oracle than having no dummy compare at all. That has
 * happened here once, at cost 10 against 12.
 */
export const BCRYPT_COST = 12;

/** Long enough that the generated value is not the weak link. */
const GENERATED_BYTES = 12;

export const MIN_PASSWORD_LENGTH = 12;

export function generatePassword(): string {
  return randomBytes(GENERATED_BYTES).toString('base64url');
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
