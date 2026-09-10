import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/session';
import { findActiveProfile, saveActiveProfile } from '@/lib/system-prompt';
import {
  formatValidationErrors,
  saveActiveProfileSchema,
  validateRequest,
} from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

/**
 * The one advisor profile, read and written through the same resolution the
 * chat path uses. A static segment beside `[id]`, so it takes precedence.
 *
 * It exists because the editor otherwise needed two round trips to show one
 * profile -- the list, which omits content by design, and then the row -- and
 * could not render until both had landed. The write side exists so "which row
 * is the profile" is decided once, on the server, rather than by a client
 * choosing between POST and PUT.
 */
export async function GET() {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    return NextResponse.json({ prompt: (await findActiveProfile()) ?? null });
  } catch (error) {
    console.error('Error fetching the active prompt:', error);
    return NextResponse.json({ error: 'Failed to fetch the active prompt' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const parsed = validateRequest(saveActiveProfileSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid advisor profile', formatValidationErrors(parsed.errors));
    }

    const saved = await saveActiveProfile(parsed.data.content, parsed.data.name);

    await recordAudit({
      userId: guard.user.id,
      action: 'updated',
      entity: 'systemPrompt',
      entityId: saved.id,
      details: {
        contentChanged: saved.contentChanged,
        previousContent: saved.contentChanged ? saved.previousContent : undefined,
      },
    });

    return NextResponse.json({ prompt: saved });
  } catch (error) {
    console.error('Error saving the active prompt:', error);
    return NextResponse.json({ error: 'Failed to save the active prompt' }, { status: 500 });
  }
}
