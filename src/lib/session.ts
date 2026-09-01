import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { forbiddenError, unauthorizedError } from '@/lib/errors';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

type Guard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guards.
 *
 * middleware.ts already denies unauthenticated requests, but every handler
 * re-checks: middleware is a matcher-based gate and a matcher mistake would
 * silently expose a route. Identity is derived here and never read from the
 * request body -- the previous code took `userId` from the client, which meant
 * the "only your own data" filter was enforced by the caller. (SEC-8)
 */
export async function requireUser(): Promise<Guard> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: unauthorizedError() };
  }
  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      role: session.user.role,
    },
  };
}

export async function requireRole(...roles: string[]): Promise<Guard> {
  const result = await requireUser();
  if (!result.ok) return result;
  if (!roles.includes(result.user.role)) {
    return { ok: false, response: forbiddenError() };
  }
  return result;
}

/**
 * Investigators and admins work across the district's incidents; reporters see
 * only what they filed. Single tenant, so there is no school/district scoping
 * beyond this.
 */
export function canReadAllIncidents(user: SessionUser): boolean {
  return user.role === 'admin' || user.role === 'investigator';
}

/**
 * Prisma `where` fragment scoping incident access to the caller. Returns an
 * empty object for staff who may read everything.
 */
export function incidentScope(user: SessionUser): { reporterId?: string } {
  return canReadAllIncidents(user) ? {} : { reporterId: user.id };
}
