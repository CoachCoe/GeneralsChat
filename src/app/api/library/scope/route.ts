import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';
import { LOCAL_JURISDICTIONS, RETRIEVABLE_DOCUMENT_KINDS } from '@/types';

/**
 * What subjects the district has actually loaded.
 *
 * Answered here rather than derived in the browser from `GET /api/policies`,
 * because "counts as coverage" is a rule with three parts -- active, a kind
 * that may be cited, and at least one searchable chunk -- and it already exists
 * in `assessCoverage`. A second copy in a component would drift from the one
 * retrieval uses, and the first symptom would be a screen promising a subject
 * the assistant cannot answer on.
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
        isActive: true,
        documentKind: { in: [...RETRIEVABLE_DOCUMENT_KINDS] },
        jurisdiction: { in: [...LOCAL_JURISDICTIONS] },
        // A row with no chunks is invisible to retrieval, so counting it would
        // claim coverage the system cannot deliver.
        chunks: { some: {} },
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
