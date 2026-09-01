import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { requireRole } from '@/lib/session';
import { policyFacetsSchema } from '@/lib/validation';
import { validationError } from '@/lib/errors';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/admin/policies/[id] - Get single policy with chunks
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const policy = await prisma.policy.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' }
        }
      }
    });

    if (!policy) {
      return NextResponse.json(
        { error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ policy });
  } catch (error) {
    console.error('Error fetching policy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policy' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/policies/[id] - Update policy
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const body = await request.json();
    const { title, content, jurisdiction, category, effectiveDate, isActive, metadata } = body;

    // A partial update may omit either facet, but must not set a bad one.
    const facets = policyFacetsSchema.partial().safeParse({ jurisdiction, category });
    if (!facets.success) {
      return validationError(
        'Jurisdiction and category must each be one of the known values',
        facets.error.flatten().fieldErrors
      );
    }

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(jurisdiction !== undefined && { jurisdiction }),
        ...(category !== undefined && { category }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata: JSON.stringify(metadata) })
      }
    });

    // If content was updated, re-index. Purges the vector store as well as the
    // DB rows -- deleteMany alone left stale Chroma entries behind (SPEC-15) --
    // and re-chunks through the RAG system so granularity matches every other
    // ingestion path. (FLOW-23, SPEC-9, DEAD-11)
    if (content !== undefined) {
      await ragSystem.deletePolicyChunks(id);
      await ragSystem.addPolicyDocument(id, content, {
        title: policy.title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        effectiveDate: policy.effectiveDate?.toISOString(),
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    console.error('Error updating policy:', error);
    return NextResponse.json(
      { error: 'Failed to update policy' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/policies/[id] - Delete policy and its chunks
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;

    // Purge the vector store first. The DB cascade removes PolicyChunk rows,
    // but Chroma entries survived it -- and vector hits whose DB row is gone
    // were being returned to the model as authoritative policy context, so a
    // deleted policy kept being cited indefinitely. (SPEC-15)
    await ragSystem.deletePolicyChunks(id);

    // Remaining chunks (if any) are removed by CASCADE.
    await prisma.policy.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting policy:', error);
    return NextResponse.json(
      { error: 'Failed to delete policy' },
      { status: 500 }
    );
  }
}
