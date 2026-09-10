import { createPromptSchema, formatValidationErrors, validateRequest } from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
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

export async function POST(request: NextRequest) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const body = await request.json();

    // Through the schema written for this route, which sat unimported while
    // the handler hand-rolled `if (!name || !content)`. That accepted a
    // 10MB name, a one-character advisor profile, and a `content` of `{}` or
    // `[]` -- both truthy -- straight into the row that is prepended to every
    // consultation. `createPromptSchema` bounds the name at 100 characters and
    // requires at least 10 characters of content.
    const validation = validateRequest(createPromptSchema, body);
    if (!validation.success) {
      return validationError('Invalid prompt', formatValidationErrors(validation.errors));
    }
    const { name, content, description } = validation.data;

    const prompt = await prisma.systemPrompt.create({
      data: {
        name,
        content,
        description,
        // From the session, never the body: this is the only provenance the
        // row carries, and the row governs mandated-reporting advice.
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
