import { createHash, randomBytes } from 'crypto';

/**
 * Registration authorised by an existing user, for one email address.
 *
 * This application deliberately has no self-registration. An invitation is not
 * that: it names one address, is single use, expires, and can be revoked. Only
 * the SHA-256 of the token is stored, so the database cannot be read for live
 * tokens.
 *
 * **The link is the credential.** There is no mail transport here, so the
 * sharer copies the link and sends it themselves, and whoever holds it can
 * claim that one account. Short expiry, single use, one address, revocable, and
 * audited on issue and on acceptance are what bound that; the interface says so
 * in words rather than leaving it to be discovered.
 *
 * No salt on the hash, deliberately: the token is 32 random bytes, so there is
 * no dictionary to defend against, and a salt would prevent the lookup by hash
 * that makes acceptance a single indexed query.
 */
const TOKEN_BYTES = 32;

export const INVITATION_TTL_DAYS = 7;

export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** The link the sharer copies. Absolute, because it is pasted elsewhere. */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/invite/${token}`;
}
