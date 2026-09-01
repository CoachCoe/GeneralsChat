import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

// GET /api/admin/prompts - List all prompts
export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const prompts = await prisma.systemPrompt.findMany({
      orderBy: [
        { isActive: 'desc' }, // Active prompts first
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Don't return full content in list view for performance
      }
    });

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    );
  }
}

// POST /api/admin/prompts - Create new prompt
export async function POST(request: NextRequest) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { name, content, description } = body;

    // Validation
    if (!name || !content) {
      return NextResponse.json(
        { error: 'Name and content are required' },
        { status: 400 }
      );
    }

    const prompt = await prisma.systemPrompt.create({
      data: {
        name,
        content,
        description,
        // From the session, never the body: this is the only provenance the
        // row carries, and the row governs mandated-reporting advice. (SEC-21)
        createdBy: guard.user.id,
        isActive: false // New prompts start as inactive
      }
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'systemPrompt',
      entityId: prompt.id,
      details: { name: prompt.name },
    });

    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    );
  }
}
