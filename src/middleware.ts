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
 * The sign-in endpoint is rate limited here rather than in a handler, because
 * it is NextAuth's own route and there is no handler of ours to put it in.
 *
 * This is the one unauthenticated write path in the application. `src/auth.ts`
 * runs `bcrypt.compare` at cost 12 deliberately even for an address with no
 * account, so every attempt costs roughly a quarter-second of *blocking* CPU on
 * a single event loop: a few hundred a minute make the app unavailable to every
 * administrator, while also giving unbounded password guessing. (SEC-11/SEC-23)
 *
 * Keyed by client address. Behind Azure Container Apps' ingress the real
 * address is in x-forwarded-for, and its first entry is the one the edge saw.
 */
function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function isCredentialsSignIn(request: NextRequest): boolean {
  return (
    request.method === 'POST' &&
    request.nextUrl.pathname.startsWith('/api/auth/callback/credentials')
  );
}

export default function middleware(request: NextRequest, event: never) {
  if (isCredentialsSignIn(request)) {
    const { limit, windowMs } = RATE_LIMITS.SIGN_IN;
    const result = checkRateLimit(`signin:${clientAddress(request)}`, limit, windowMs);
    if (!result.allowed) {
      // A plain 429, with no hint about whether the address exists.
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Too many sign-in attempts. Please wait and try again.',
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
