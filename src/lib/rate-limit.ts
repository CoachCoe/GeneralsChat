/**
 * A fixed-window request counter, held in this process's memory.
 *
 * Deliberately simple, and deliberately not distributed. The pilot runs one
 * replica (`minReplicas: 1` / `maxReplicas: 1` in the Container Apps config),
 * so one process sees every request and an in-memory counter is exact. Reaching
 * for Redis before there is a second replica would add an operational
 * dependency, and a failure mode, to buy nothing.
 *
 * **This must move to a shared store before a second replica exists.** With N
 * replicas each holds its own counter, so the effective limit becomes N times
 * what is configured -- it degrades quietly rather than failing, which is
 * exactly the kind of thing that goes unnoticed. `docs/roadmap.md` records it.
 *
 * Fixed window, not sliding: a caller can send `limit` requests at the end of
 * one window and `limit` again at the start of the next. That burst is
 * acceptable here because the purpose is to bound sustained abuse -- unbounded
 * password guessing, and unbounded billed model calls -- not to smooth traffic.
 * (SEC-11, SEC-23)
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still permitted in the current window. */
  remaining: number;
  /** When the current window ends, epoch ms. */
  resetAt: number;
  /** Seconds until the window ends; what a Retry-After header should say. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Drop expired windows so the map cannot grow without bound.
 *
 * Keyed by IP for unauthenticated traffic, so without this an attacker cycling
 * source addresses turns the limiter into a memory leak -- a denial of service
 * introduced by the thing meant to prevent one.
 */
function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

let lastEviction = 0;
const EVICTION_INTERVAL_MS = 60_000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  if (now - lastEviction > EVICTION_INTERVAL_MS) {
    evictExpired(now);
    lastEviction = now;
  }

  const existing = windows.get(key);
  const window =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  window.count += 1;
  windows.set(key, window);

  const allowed = window.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - window.count),
    resetAt: window.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
  };
}

/** Test seam. Never called in production code. */
export function resetRateLimits(): void {
  windows.clear();
  lastEviction = 0;
}

/**
 * Limits, and why each is what it is.
 *
 * SIGN_IN is the one that matters most: `/api/auth/*` is public, and
 * `src/auth.ts` runs `bcrypt.compare` at cost 12 even for an address with no
 * account, so every attempt costs roughly a quarter-second of *blocking* CPU on
 * a single event loop. A few hundred a minute make the app unavailable to every
 * administrator while also giving unbounded password guessing.
 *
 * CHAT bounds billed spend: one chat turn can trigger classification,
 * obligation derivation and the guidance call. 30/minute is far above what an
 * administrator typing into a chat box can produce and far below what a loop
 * can.
 */
export const RATE_LIMITS = {
  SIGN_IN: { limit: 10, windowMs: 5 * 60_000 },
  CHAT: { limit: 30, windowMs: 60_000 },
  UPLOAD: { limit: 20, windowMs: 60_000 },
} as const;
