import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

const updateUserSchema = z.object({ active: z.boolean() });

/**
 * Revoke or restore a user.
 *
 * Revoking is not deleting. `AuditLog.userId` is a required relation precisely
 * so the record of who read which student's incident outlives the account, and
 * the incidents a leaver filed stay attributed to them. So the account is
 * deactivated: sign-in is refused and every guarded request answers 401, which
 * is what a deleted account would have answered.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const parsed = validateRequest(updateUserSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid update', formatValidationErrors(parsed.errors));
    }
    const { active } = parsed.data;

    // An administrator revoking themselves would be locked out of the screen
    // that could undo it, and the pilot may have exactly one.
    if (id === guard.user.id && !active) {
      return validationError('You cannot revoke your own account', {
        active: ['Ask another administrator'],
      });
    }

    const existing = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!existing) return notFoundError('User');

    const user = await prisma.user.update({
      where: { id },
      data: { deactivatedAt: active ? null : new Date() },
      select: { id: true, name: true, email: true, role: true, deactivatedAt: true },
    });

    await recordAudit({
      userId: guard.user.id,
      action: active ? 'restored' : 'revoked',
      entity: 'user',
      entityId: id,
      details: { email: existing.email },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return createErrorResponse(error, 'Failed to update user', {
      endpoint: '/api/admin/users/[id]',
      method: 'PATCH',
    });
  }
}
