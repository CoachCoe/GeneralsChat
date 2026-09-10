import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { requireRole } from '@/lib/session';
import {
  createPolicySchema,
  formatValidationErrors,
  validateRequest,
} from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { assertIndexablePolicyText, UploadError } from '@/lib/uploads';

export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
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

export async function POST(request: NextRequest) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { description, keywords } = body;

    // Through the schema written for this route. The hand-rolled truthiness
    // check let an unbounded title and an arbitrary `effectiveDate` string
    // through -- `new Date('soon')` is an Invalid Date, which Prisma rejects as
    // a 500 rather than the 400 it is. The date format was validated on the
    // update path and on neither create path.
    const validation = validateRequest(createPolicySchema, {
      title: body.title,
      content: body.content,
      jurisdiction: body.jurisdiction,
      category: body.category,
      effectiveDate: body.effectiveDate,
    });
    if (!validation.success) {
      return validationError('Invalid policy', formatValidationErrors(validation.errors));
    }
    const { title, jurisdiction, category, effectiveDate } = validation.data;

    // `content` is optional on the schema because the file-upload route
    // supplies it by extraction; on this paste-text path it is the whole
    // input, so it is required here.
    const content = validation.data.content ?? '';
    if (!content.trim()) {
      return validationError('Policy text is required on this route', {
        content: ['Paste the policy text, or use the file-upload route.'],
      });
    }
    assertIndexablePolicyText(content);

    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        jurisdiction,
        category,
        effectiveDate: new Date(effectiveDate),
        metadata: JSON.stringify({
          keywords: keywords || [],
          description,
        }),
        // Inactive until the chunks land. An indexing failure would otherwise
        // leave an active policy with zero chunks: invisible to retrieval, but
        // counted as loaded by the library page -- coverage claimed and not
        // delivered.
        isActive: false,
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
    let chunksCreated = 0;
    try {
      await ragSystem.addPolicyDocument(policy.id, content, {
        title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        effectiveDate,
        keywords: keywords || [],
      });

      chunksCreated = await prisma.policyChunk.count({
        where: { policyId: policy.id },
      });

      if (chunksCreated === 0) {
        throw new UploadError(
          'The text was stored but produced no searchable chunks, so it would be invisible to retrieval. It has not been activated.',
          422
        );
      }

      await prisma.policy.update({ where: { id: policy.id }, data: { isActive: true } });
    } catch (error) {
      await prisma.policyChunk.deleteMany({ where: { policyId: policy.id } }).catch(() => {});
      await prisma.policy.delete({ where: { id: policy.id } }).catch(() => {});
      throw error;
    }

    return NextResponse.json(
      { policy: { ...policy, isActive: true }, chunksCreated },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating policy:', error);
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}
