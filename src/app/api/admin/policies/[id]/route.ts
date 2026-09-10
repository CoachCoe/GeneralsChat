import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { requireRole } from '@/lib/session';
import { updatePolicySchema, validateRequest } from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/admin/policies/[id] - Get single policy with chunks
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
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

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;

    // The whole body, not two fields of it. This is the only write path that
    // edits a row already in the library, so an unchecked `title` or
    // `isActive` here silently degrades a policy the guidance is citing.
    const parsed = validateRequest(updatePolicySchema, await request.json());
    if (!parsed.success) {
      return validationError(
        'The update contains a field this route cannot apply, or a value it cannot accept',
        parsed.errors.flatten().fieldErrors
      );
    }
    const { title, content, jurisdiction, category, effectiveDate, isActive, metadata } =
      parsed.data;

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        // The parsed values, not the raw body: validation that is thrown away
        // stops being validation the moment the schema gains a transform.
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(jurisdiction !== undefined && { jurisdiction }),
        ...(category !== undefined && { category }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata: JSON.stringify(metadata) })
      }
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'updated',
      entity: 'policy',
      entityId: id,
      details: {
        title: policy.title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        isActive: policy.isActive,
        contentChanged: content !== undefined,
      },
    });

    // If content was updated, re-index. Purges the vector store as well as the
    // DB rows -- deleteMany alone left stale Chroma entries behind --
    // and re-chunks through the RAG system so granularity matches every other
    // ingestion path.
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
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;

    // Purge the vector store first. The DB cascade removes PolicyChunk rows
    // but not Chroma entries, and a vector hit whose DB row is gone would keep
    // reaching the model as authoritative policy context.
    await ragSystem.deletePolicyChunks(id);

    // Remaining chunks (if any) are removed by CASCADE.
    await prisma.policy.delete({
      where: { id }
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'deleted',
      entity: 'policy',
      entityId: id,
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
