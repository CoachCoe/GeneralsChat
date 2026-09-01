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

/**
 * Routes reachable without a session. Everything else is denied by default.
 *
 * `/api/health` is here because a container platform's probe has no session.
 * It returns a fixed `{status:'ok'}` and reads nothing.
 */
const PUBLIC_PATHS = ['/login', '/about', '/api/health'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // NextAuth's own endpoints must stay reachable to sign in at all.
  if (pathname.startsWith('/api/auth')) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
}

/**
 * Whether to issue the session cookie as Secure, taken from the URL the
 * deployment declares for itself rather than from the protocol of the request.
 *
 * Behind a platform ingress that terminates TLS -- Azure Container Apps, and
 * every other managed container host -- the app sees plain http even though
 * the browser spoke https, so deriving from the request marks the cookie
 * insecure on a site that is in fact secure. Deriving from NODE_ENV is worse
 * in the other direction: the e2e suite runs a production build over http, and
 * a __Secure- cookie is rejected outright there, so auth would break in tests
 * for a reason that has nothing to do with the code under test.
 *
 * The declared URL is the one signal that is true in both places. (SEC-28)
 */
export function shouldUseSecureCookies(declaredUrl: string | undefined): boolean {
  return (declaredUrl ?? '').trim().toLowerCase().startsWith('https://');
}

const useSecureCookies = shouldUseSecureCookies(
  process.env.NEXTAUTH_URL ?? process.env.AUTH_URL
);

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    /*
     * Thirty minutes, refreshed on activity — an effective idle timeout.
     *
     * These screens carry student records and get left open on desks and in
     * hallways. A working-day session was too long for that. updateAge rolls
     * the token forward while someone is actually using the app, so this bites
     * only when a session has been idle. (design 1h)
     */
    maxAge: 30 * 60,
    updateAge: 5 * 60,
  },
  /* Pinned, not derived from the request protocol. See useSecureCookies. */
  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
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
