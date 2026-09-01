import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { requireRole } from '@/lib/session';
import { policyFacetsSchema } from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

// GET /api/admin/policies - List all policies
export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const policies = await prisma.policy.findMany({
      orderBy: [
        { isActive: 'desc' }, // Active policies first
        { effectiveDate: 'desc' }
      ],
      include: {
        _count: {
          select: { chunks: true }
        }
      }
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('Error fetching policies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 }
    );
  }
}

// POST /api/admin/policies - Create new policy
export async function POST(request: NextRequest) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { title, content, jurisdiction, category, effectiveDate, description, keywords } = body;

    // Validation
    if (!title || !content || !effectiveDate) {
      return NextResponse.json(
        { error: 'Title, content, and effectiveDate are required' },
        { status: 400 }
      );
    }

    // Create policy
    const facets = policyFacetsSchema.safeParse({ jurisdiction, category });
    if (!facets.success) {
      return validationError(
        'Jurisdiction and category must each be one of the known values',
        facets.error.flatten().fieldErrors
      );
    }

    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        jurisdiction: facets.data.jurisdiction,
        category: facets.data.category,
        effectiveDate: new Date(effectiveDate),
        metadata: JSON.stringify({
          keywords: keywords || [],
          description,
        }),
        isActive: true,
        version: 1
      }
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'policy',
      entityId: policy.id,
      details: { title: policy.title, jurisdiction: policy.jurisdiction, category: policy.category },
    });

    // Indexed through the RAG system, which applies the documented 1000-word /
    // 200-word-overlap split AND generates embeddings + Chroma entries. The
    // previous inline `content.match(/.{1,500}/g)` chunker was wrong three
    // ways: `.` excludes \n without the s flag, so String.match returned one
    // match per LINE and dropped the newlines entirely (a policy with 60-char
    // lines became hundreds of 60-char fragments); there was no overlap, so any
    // requirement spanning a boundary was severed; and writing PolicyChunk rows
    // directly left `embedding` null and Chroma untouched, making
    // admin-uploaded policies invisible to vector search.
    // (FLOW-22, FLOW-23, SPEC-9, DEAD-11)
    await ragSystem.addPolicyDocument(policy.id, content, {
      title,
      jurisdiction: policy.jurisdiction,
      category: policy.category,
      effectiveDate,
      keywords: keywords || [],
    });

    const chunksCreated = await prisma.policyChunk.count({
      where: { policyId: policy.id },
    });

    return NextResponse.json({ policy, chunksCreated }, { status: 201 });
  } catch (error) {
    console.error('Error creating policy:', error);
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}
