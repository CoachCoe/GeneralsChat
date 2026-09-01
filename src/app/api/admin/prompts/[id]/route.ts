import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/admin/prompts/[id] - Get single prompt with full content
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const prompt = await prisma.systemPrompt.findUnique({
      where: { id }
    });

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/prompts/[id] - Update prompt
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const body = await request.json();
    const { name, content, description, isActive } = body;

    // Captured before the write. This row is loaded as the system prompt for
    // every consultation, so an edit here changes the mandated-reporting advice
    // the district gives -- and SystemPrompt carries only updatedAt, no prior
    // content and no actor. Without the previous text the change is not
    // reconstructable afterwards. (SEC-20)
    const before = await prisma.systemPrompt.findUnique({
      where: { id },
      select: { name: true, content: true, isActive: true },
    });

    // If activating this prompt, deactivate all others
    if (isActive) {
      await prisma.systemPrompt.updateMany({
        where: { isActive: true },
        data: { isActive: false }
      });
    }

    const prompt = await prisma.systemPrompt.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive })
      }
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'updated',
      entity: 'systemPrompt',
      entityId: id,
      details: {
        name: prompt.name,
        activated: isActive === true && before?.isActive !== true,
        contentChanged: content !== undefined && content !== before?.content,
        previousContent: before?.content,
      },
    });

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/prompts/[id] - Delete prompt
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    // Prevent deleting active prompt
    const prompt = await prisma.systemPrompt.findUnique({
      where: { id }
    });

    if (prompt?.isActive) {
      return NextResponse.json(
        { error: 'Cannot delete active prompt. Please activate another prompt first.' },
        { status: 400 }
      );
    }

    await prisma.systemPrompt.delete({
      where: { id }
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'deleted',
      entity: 'systemPrompt',
      entityId: id,
      details: { name: prompt?.name, previousContent: prompt?.content },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
}
