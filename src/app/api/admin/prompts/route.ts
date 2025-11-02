import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/prompts - List all prompts
export async function GET() {
  try {
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
    const body = await request.json();
    const { name, content, description, createdBy } = body;

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
        createdBy,
        isActive: false // New prompts start as inactive
      }
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
