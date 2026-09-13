import type { Prisma } from '@/generated/prisma';

/**
 * Who may read an incident, and who may change it.
 *
 * Its own module, with no imports but a type, so it can be tested directly:
 * `session.ts` reaches for Prisma and next-auth, and the two questions this
 * answers are the whole access-control surface of the application. They are
 * worth testing without a database.
 */

export interface ScopedUser {
  id: string;
  role: string;
}

/**
 * Investigators and admins work across the district's incidents; reporters see
 * only what they filed or were shown. Single tenant, so there is no
 * school/district scoping beyond this.
 */
export function canReadAllIncidents(user: ScopedUser): boolean {
  return user.role === 'admin' || user.role === 'investigator';
}

/**
 * Who may **change** an incident: the reporter who filed it, and staff.
 *
 * Every write goes through this and no share widens it. A share is "read this
 * with me", so a recipient cannot change the incident's status, discharge a
 * statutory obligation, attach a student record, or add a turn to the
 * assistant's transcript. The alternative was a capability matrix -- a
 * permission system to design, test and explain, for a pilot with one user
 * type -- and a rule that fits in a sentence is worth more here.
 */
export function incidentScope(user: ScopedUser): { reporterId?: string } {
  return canReadAllIncidents(user) ? {} : { reporterId: user.id };
}

/**
 * Who may **read** an incident: the reporter, staff, and anyone it is shared
 * with.
 *
 * Every read path takes this and every write path takes `incidentScope`. Which
 * of the two a handler imports is the whole of its access decision.
 *
 * Out of scope still resolves to nothing, and callers still answer 404 rather
 * than 403: an id must not be confirmed to someone who may not read it.
 */
export function incidentReadScope(user: ScopedUser): Prisma.IncidentWhereInput {
  if (canReadAllIncidents(user)) return {};
  return {
    OR: [{ reporterId: user.id }, { shares: { some: { userId: user.id } } }],
  };
}
