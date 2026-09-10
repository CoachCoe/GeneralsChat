import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { POLICY_CATEGORIES, POLICY_JURISDICTIONS } from '@/types';
import { requireUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const jurisdiction = searchParams.get('jurisdiction');
    const category = searchParams.get('category');
    const isActive = searchParams.get('active');

    // Allowlisted filters rather than `any`: an unknown value is ignored
    // instead of being passed through to Prisma.
    const where: { jurisdiction?: string; category?: string; isActive?: boolean } = {};
    if (jurisdiction && (POLICY_JURISDICTIONS as readonly string[]).includes(jurisdiction)) {
      where.jurisdiction = jurisdiction;
    }
    if (category && (POLICY_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category;
    }
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    const policies = await prisma.policy.findMany({
      where,
      // Explicit projection. This returned whole rows, so any authenticated
      // user could read `content` and `filePath` -- an absolute server path,
      // which is reconnaissance for the path-traversal bug class this codebase
      // has already shipped twice. The library page uses six fields.
      select: {
        id: true,
        title: true,
        jurisdiction: true,
        category: true,
        effectiveDate: true,
        isActive: true,
        // How many searchable chunks the policy has. A row with none is
        // invisible to retrieval while still counting as a loaded policy to
        // anyone reading the library -- which is the state production was once
        // in, after a re-index against an unmigrated schema left every policy
        // at zero chunks and nobody could tell from this page. It leaks
        // nothing: a count, not content and not a path.
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('Get policies error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 }
    );
  }
}

// Read-only by design: there is no POST here. This path sits outside the
// /api/admin prefix, so `isAdminPath` in auth.config.ts does not cover it and
// a handler's own requireRole would be the only thing holding.
//
// Ingestion goes through POST /api/admin/policies/upload (file or URL), or
// POST /api/admin/policies for pasted text. Both live behind the prefix the
// middleware gates, and both write to policyUploadsDir().
