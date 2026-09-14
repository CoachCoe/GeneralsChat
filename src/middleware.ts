import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from '@/auth.config';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { clientAddress, trustedHops } from '@/lib/client-address';

/**
 * Deny-by-default gate in front of every page and API route.
 *
 * Uses the Edge-safe config only -- no Prisma, no bcrypt. The `authorized`
 * callback in src/auth.config.ts holds the rules.
 */
const authMiddleware = NextAuth(authConfig).auth;

/** The decision itself lives in `@/lib/client-address`, where it is tested. */
function callerAddress(request: NextRequest): string {
  return clientAddress(
    {
      forwardedFor: request.headers.get('x-forwarded-for'),
      realIp: request.headers.get('x-real-ip'),
    },
    trustedHops(process.env.TRUSTED_PROXY_HOPS)
  );
}

/**
 * A second bucket, keyed by the address being signed in to.
 *
 * The address key alone is rotatable by anyone who can reach the app from more
 * than one source. This one is not: an attacker working through a botnet still
 * cannot exceed the limit against a single administrator's account.
 *
 * Read from the form body, which is the only place it exists on this request --
 * so it bounds attempts against an account, and the address bucket bounds the
 * cost of attempts in general. Neither replaces the other.
 */
async function signInSubject(request: NextRequest): Promise<string | null> {
  try {
    const form = await request.clone().formData();
    const email = form.get('email');
    return typeof email === 'string' && email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function isUnauthenticatedWrite(request: NextRequest): boolean {
  if (request.method !== 'POST') return false;
  const { pathname } = request.nextUrl;
  return (
    pathname.startsWith('/api/auth/callback/credentials') ||
    pathname === '/api/invitations/accept'
  );
}

export default async function middleware(request: NextRequest, event: never) {
  if (isUnauthenticatedWrite(request)) {
    const { limit, windowMs } = RATE_LIMITS.SIGN_IN;
    const subject = await signInSubject(request);
    const keys = [`signin:${callerAddress(request)}`];
    if (subject) keys.push(`signin-subject:${subject}`);

    // Every bucket is counted, not just the first to refuse: short-circuiting
    // would let a caller spend one budget without touching the other.
    const results = keys.map(key => checkRateLimit(key, limit, windowMs));
    const result = results.find(r => !r.allowed) ?? results[0]!;
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
