import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from '@/auth.config';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Deny-by-default gate in front of every page and API route.
 *
 * Uses the Edge-safe config only -- no Prisma, no bcrypt. The `authorized`
 * callback in src/auth.config.ts holds the rules.
 */
const authMiddleware = NextAuth(authConfig).auth;

/**
 * The two unauthenticated write paths are rate limited here rather than in a
 * handler: sign-in is NextAuth's own route with no handler of ours to put it
 * in, and accepting an invitation is limited for the same reason and by the
 * same key, so a caller cannot spend one budget through the other.
 *
 * Both hash a password. `src/auth.ts` runs `bcrypt.compare` at cost 12
 * deliberately even for an address with no account, and acceptance runs
 * `bcrypt.hash` at the same cost, so every attempt costs roughly a
 * quarter-second of *blocking* CPU on a single event loop: a few hundred a
 * minute make the app unavailable to every administrator, while also giving
 * unbounded password guessing and unbounded invitation-token guessing.
 *
 * Keyed by client address. Behind Azure Container Apps' ingress the real
 * address is in x-forwarded-for, and its first entry is the one the edge saw.
 */
function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function isUnauthenticatedWrite(request: NextRequest): boolean {
  if (request.method !== 'POST') return false;
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith('/api/auth/callback/credentials') ||
    pathname === '/api/invitations/accept'
  );
}

export default function middleware(request: NextRequest, event: never) {
  if (isUnauthenticatedWrite(request)) {
    const { limit, windowMs } = RATE_LIMITS.SIGN_IN;
    const result = checkRateLimit(`signin:${clientAddress(request)}`, limit, windowMs);
    if (!result.allowed) {
      // A plain 429, with no hint about whether the address exists.
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Too many attempts. Please wait and try again.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
      );
    }
  }

  return (authMiddleware as unknown as (r: NextRequest, e: never) => unknown)(
    request,
    event
  ) as ReturnType<typeof NextResponse.next>;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the favicon, and static asset files.
     * Note /uploads is intentionally NOT excluded: attachment files are
     * student-record material and must not be publicly readable.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
