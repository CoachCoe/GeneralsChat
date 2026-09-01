import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Deny-by-default gate in front of every page and API route.
 *
 * Uses the Edge-safe config only -- no Prisma, no bcrypt. The `authorized`
 * callback in src/auth.config.ts holds the rules.
 */
export const { auth: middleware } = NextAuth(authConfig);

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
