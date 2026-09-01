import { NextResponse } from 'next/server';
import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the auth configuration.
 *
 * middleware.ts runs on the Edge runtime, where Prisma cannot run. This file
 * therefore contains no providers and no database access -- only the route
 * authorization rules and the token/session shape. The Credentials provider,
 * which needs Prisma and bcrypt, lives in src/auth.ts and is used only by the
 * Node-runtime route handler.
 */

/** Routes reachable without a session. Everything else is denied by default. */
const PUBLIC_PATHS = ['/login', '/about'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // NextAuth's own endpoints must stay reachable to sign in at all.
  if (pathname.startsWith('/api/auth')) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
}

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // one working day
  },
  callbacks: {
    /**
     * Deny by default. Only PUBLIC_PATHS are reachable unauthenticated;
     * /admin and /api/admin additionally require the admin role.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) return true;

      // API callers get a status code, not a redirect to an HTML login page.
      // Returning `false` sends a 302 to /login, which is right for a browser
      // navigation and useless (and confusing) for fetch().
      const isApi = pathname.startsWith('/api');
      const user = auth?.user;

      if (!user) {
        return isApi
          ? NextResponse.json(
              { error: 'Authentication required', code: 'UNAUTHORIZED' },
              { status: 401 }
            )
          : false;
      }

      if (isAdminPath(pathname) && user.role !== 'admin') {
        return isApi
          ? NextResponse.json(
              { error: 'Admin role required', code: 'FORBIDDEN' },
              { status: 403 }
            )
          : NextResponse.redirect(new URL('/', request.nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
