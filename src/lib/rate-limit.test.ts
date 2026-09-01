import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimits, RATE_LIMITS } from './rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits());

  const NOW = 1_000_000;

  it('allows up to the limit and refuses the one after', () => {
    for (let i = 1; i <= 3; i++) {
      expect(checkRateLimit('k', 3, 60_000, NOW).allowed).toBe(true);
    }
    expect(checkRateLimit('k', 3, 60_000, NOW).allowed).toBe(false);
  });

  it('counts each key separately', () => {
    // Otherwise one noisy caller locks out every administrator.
    expect(checkRateLimit('a', 1, 60_000, NOW).allowed).toBe(true);
    expect(checkRateLimit('b', 1, 60_000, NOW).allowed).toBe(true);
    expect(checkRateLimit('a', 1, 60_000, NOW).allowed).toBe(false);
  });

  it('opens a fresh window once the old one expires', () => {
    expect(checkRateLimit('k', 1, 60_000, NOW).allowed).toBe(true);
    expect(checkRateLimit('k', 1, 60_000, NOW + 59_000).allowed).toBe(false);
    expect(checkRateLimit('k', 1, 60_000, NOW + 60_001).allowed).toBe(true);
  });

  it('reports what a Retry-After header needs', () => {
    const first = checkRateLimit('k', 1, 60_000, NOW);
    expect(first.resetAt).toBe(NOW + 60_000);

    const refused = checkRateLimit('k', 1, 60_000, NOW + 30_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(30);
    // Never zero: a Retry-After of 0 invites an immediate retry.
    expect(checkRateLimit('k', 1, 60_000, NOW + 59_999).retryAfterSeconds).toBe(1);
  });

  it('reports remaining without going negative', () => {
    expect(checkRateLimit('k', 2, 60_000, NOW).remaining).toBe(1);
    expect(checkRateLimit('k', 2, 60_000, NOW).remaining).toBe(0);
    expect(checkRateLimit('k', 2, 60_000, NOW).remaining).toBe(0);
  });

  it('does not accumulate windows for keys that have expired', () => {
    // Keyed by IP for unauthenticated traffic, so an attacker cycling source
    // addresses would otherwise turn the limiter into a memory leak.
    for (let i = 0; i < 500; i++) checkRateLimit(`ip-${i}`, 5, 1_000, NOW);
    // Eviction runs at most once a minute; step past both that and the window.
    checkRateLimit('trigger', 5, 1_000, NOW + 120_000);
    // The old keys are gone, so each starts a fresh window.
    expect(checkRateLimit('ip-0', 1, 1_000, NOW + 120_000).allowed).toBe(true);
  });

  it('sets sign-in stricter than chat, because it is the unauthenticated one', () => {
    // /api/auth/* is public and bcrypt at cost 12 blocks the event loop for
    // ~0.25s per attempt, even for an address with no account.
    const signInPerMinute = RATE_LIMITS.SIGN_IN.limit / (RATE_LIMITS.SIGN_IN.windowMs / 60_000);
    const chatPerMinute = RATE_LIMITS.CHAT.limit / (RATE_LIMITS.CHAT.windowMs / 60_000);
    expect(signInPerMinute).toBeLessThan(chatPerMinute);
  });
});
