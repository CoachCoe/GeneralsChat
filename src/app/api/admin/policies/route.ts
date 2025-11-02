import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

    // Create chunks (500 chars per chunk)
    const chunkSize = 500;
    const chunks = content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];

    for (let i = 0; i < chunks.length; i++) {
      await prisma.policyChunk.create({
        data: {
          policyId: policy.id,
          content: chunks[i],
          chunkIndex: i,
          metadata: JSON.stringify({
            keywords: keywords || [],
          }),
        }
      });
    }

    return NextResponse.json({
      policy,
      chunksCreated: chunks.length
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating policy:', error);
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}
