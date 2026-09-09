import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
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

  /*
   * The session says who you are; the database says what you may do. (SEC-19)
   *
   * `role` used to be read straight off the JWT, and the `jwt` callback only
   * writes it at sign-in -- so a role change took effect no sooner than the
   * token expired, and because `updateAge` rolls the token forward on activity,
   * an administrator demoted mid-shift kept administrator access for as long as
   * they kept working. Deleting the account did not end the session either.
   * There was no mechanism to revoke anything.
   *
   * So the row is re-read on every guarded request. A demotion takes effect on
   * the next request, and a deleted account is unauthenticated rather than
   * merely unauthorised: the session names a user who no longer exists, and it
   * cannot be reissued because sign-in would fail too. The cost is one indexed
   * lookup per request, which is the right price for the property.
   *
   * The identity itself still comes from the session and never from the
   * request -- `session.user.id` is what is looked up, and no handler may pass
   * an id of its own.
   */
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return { ok: false, response: unauthorizedError() };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

/**
 * As `requireUser`, and additionally that the caller currently holds one of
 * these roles -- currently, because the role comes from the row rather than
 * from the token. See the note there.
 */
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
