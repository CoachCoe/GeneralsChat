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
      // has already shipped twice. The library page uses six fields. (SEC-27)
      select: {
        id: true,
        title: true,
        jurisdiction: true,
        category: true,
        effectiveDate: true,
        isActive: true,
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

// POST is gone. It was the third of three ingestion routes, called by no
// client, and it sat outside the /api/admin prefix -- so `isAdminPath` in
// auth.config.ts did not cover it and the handler's own requireRole was the
// only thing holding. It is also the route SEC-3 exploited.
//
// The canonical path is POST /api/admin/policies/upload (file or URL), with
// POST /api/admin/policies for pasted text. Both live behind the prefix the
// middleware gates, and both write to policyUploadsDir(). (OQ-2)
