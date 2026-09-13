import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('limits configured from the environment', () => {
  const KEY = 'RATE_LIMIT_CHAT_PER_MINUTE';
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
    vi.resetModules();
  });

  async function chatLimit(value: string | undefined) {
    if (value === undefined) delete process.env[KEY];
    else process.env[KEY] = value;
    vi.resetModules();
    const { RATE_LIMITS } = await import('./rate-limit');
    return RATE_LIMITS.CHAT.limit;
  }

  it('uses the default when nothing is set', async () => {
    expect(await chatLimit(undefined)).toBe(30);
  });

  it('honours a positive integer', async () => {
    expect(await chatLimit('1000')).toBe(1000);
  });

  it('falls back rather than honouring a value that would remove the bound', async () => {
    // "someone typed none" must not become an unlimited endpoint.
    for (const bad of ['none', '', '0', '-5', '1.5', 'Infinity']) {
      expect(await chatLimit(bad), bad).toBe(30);
    }
  });

  it('does not let the environment touch the sign-in limit', async () => {
    // The one unauthenticated write path, running bcrypt at cost 12. There is
    // no deployment for which a looser bound is right, so there is no knob.
    process.env.RATE_LIMIT_SIGN_IN_PER_MINUTE = '10000';
    vi.resetModules();
    const { RATE_LIMITS } = await import('./rate-limit');
    expect(RATE_LIMITS.SIGN_IN.limit).toBe(10);
    delete process.env.RATE_LIMIT_SIGN_IN_PER_MINUTE;
  });
});
