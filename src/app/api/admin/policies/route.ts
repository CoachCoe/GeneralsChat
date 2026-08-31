import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';

// GET /api/admin/policies - List all policies
export async function GET() {
  try {
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
    const body = await request.json();
    const { title, content, policyType, effectiveDate, description, keywords } = body;

    // Validation
    if (!title || !content || !policyType || !effectiveDate) {
      return NextResponse.json(
        { error: 'Title, content, policyType, and effectiveDate are required' },
        { status: 400 }
      );
    }

    // Create policy
    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        policyType,
        effectiveDate: new Date(effectiveDate),
        metadata: JSON.stringify({
          keywords: keywords || [],
          description,
        }),
        isActive: true,
        version: 1
      }
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
      policyType,
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
