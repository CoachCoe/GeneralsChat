import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/admin/policies/[id] - Get single policy with chunks
export async function GET(request: NextRequest, { params }: Params) {
  try {
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
    const { id } = await params;
    const body = await request.json();
    const { title, content, policyType, effectiveDate, isActive, metadata } = body;

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(policyType !== undefined && { policyType }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata: JSON.stringify(metadata) })
      }
    });

    // If content was updated, recreate chunks
    if (content !== undefined) {
      // Delete old chunks
      await prisma.policyChunk.deleteMany({
        where: { policyId: id }
      });

      // Create new chunks
      const chunkSize = 500;
      const chunks = content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];

      for (let i = 0; i < chunks.length; i++) {
        await prisma.policyChunk.create({
          data: {
            policyId: id,
            content: chunks[i],
            chunkIndex: i,
            metadata: metadata ? JSON.stringify(metadata) : undefined,
          }
        });
      }
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
    const { id } = await params;
    // Chunks will be deleted automatically via CASCADE
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
