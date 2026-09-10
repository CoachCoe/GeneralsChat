import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';

/**
 * The one profile the model is actually being sent, or null when none is
 * configured and the in-code default applies.
 *
 * A static segment beside `[id]`, so it takes precedence over it. It exists
 * because the editor otherwise needs two round trips to show one profile --
 * the list, which omits content by design, and then the row -- and the editor
 * cannot render until both have landed.
 */
export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const prompt = await prisma.systemPrompt.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ prompt: prompt ?? null });
  } catch (error) {
    console.error('Error fetching the active prompt:', error);
    return NextResponse.json({ error: 'Failed to fetch the active prompt' }, { status: 500 });
  }
}
