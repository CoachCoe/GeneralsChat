import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';
import { LOCAL_JURISDICTIONS, RETRIEVABLE_POLICY_WHERE } from '@/types';

/**
 * What subjects the district has actually loaded.
 *
 * Answered here rather than derived in the browser from `GET /api/policies`,
 * because "loaded" is a rule -- `RETRIEVABLE_POLICY_WHERE` -- and a copy of it
 * in a component would drift from the one retrieval uses. The first symptom
 * would be a screen promising a subject the assistant cannot answer on.
 *
 * The local-jurisdiction filter is this route's own, and deliberately not part
 * of that shared rule: a loaded federal Title IX rule is not the district
 * having written a Title IX policy, and this sentence says "your district has
 * loaded".
 *
 * Categories only: no titles, no counts, nothing about a document. Which
 * subjects a district has written policy for is the least that can be said and
 * still be useful.
 */
export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const covered = await prisma.policy.findMany({
      where: {
        ...RETRIEVABLE_POLICY_WHERE,
        jurisdiction: { in: [...LOCAL_JURISDICTIONS] },
      },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    return NextResponse.json({ categories: covered.map(policy => policy.category) });
  } catch (error) {
    return createErrorResponse(error, 'Failed to read the library scope', {
      endpoint: '/api/library/scope',
      method: 'GET',
    });
  }
}
