import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/admin/prompts/[id] - Get single prompt with full content
export async function GET(request: NextRequest, { params }: Params) {
  try {
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
    const { id } = await params;
    const body = await request.json();
    const { name, content, description, isActive } = body;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
}
