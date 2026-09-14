/**
 * Which address a request actually came from, for rate-limiting purposes.
 *
 * Its own module with no imports, so it can be unit tested: `middleware.ts`
 * pulls in NextAuth, and this decides the key that bounds the only
 * unauthenticated write paths in the application.
 *
 * `x-forwarded-for` is append-only. Each proxy adds the address it saw, so the
 * RIGHTMOST entries are written by infrastructure we control and the leftmost
 * is whatever the client sent. Both shipped deploy paths append rather than
 * replace, so reading the first entry made the rate-limit key attacker-chosen:
 * a fresh value per request bought a fresh counter, and with it unbounded
 * password guessing and unbounded bcrypt at cost 12 on a one-instance
 * deployment.
 */

/** What the header looks like when nobody we trust wrote it. */
export const UNTRUSTED = 'untrusted-forwarded';

/** No header at all — a direct connection, or a proxy that strips it. */
export const UNKNOWN = 'unknown';

/**
 * How many entries the platform appends. 1 for Container Apps and plain Cloud
 * Run; 2 behind an additional load balancer. A value that is not a positive
 * integer falls back to 1 rather than being honoured: the failure mode of a
 * mistyped setting must not be a trusted client-supplied address.
 */
export function trustedHops(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function clientAddress(
  headers: { forwardedFor: string | null; realIp: string | null },
  hops: number
): string {
  if (headers.forwardedFor) {
    const entries = headers.forwardedFor
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    // Shorter than the hops we expect means the request did not arrive through
    // the proxy we think it did, so it shares one bucket rather than being
    // trusted to name itself.
    if (entries.length >= hops) return entries[entries.length - hops]!;
    return UNTRUSTED;
  }
  return headers.realIp ?? UNKNOWN;
}
