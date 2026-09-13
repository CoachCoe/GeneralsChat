import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { createErrorResponse, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import { generatePassword, hashPassword } from '@/lib/password';

/**
 * The one role this creates.
 *
 * Administrators and investigators exist, and `scripts/create-user.ts` can
 * still make them; they are not offered here. A screen that can mint an admin
 * is a screen where a misclick grants the district's whole incident record, and
 * the pilot needs exactly one kind of account.
 */
const CREATED_ROLE = 'reporter';

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
});

export async function GET() {
  try {
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        deactivatedAt: true,
        createdAt: true,
        _count: { select: { reportedIncidents: true } },
      },
      // Active first, then alphabetical: the list is read to find a person.
      orderBy: [{ deactivatedAt: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ users });
  } catch (error) {
    return createErrorResponse(error, 'Failed to list users', {
      endpoint: '/api/admin/users',
      method: 'GET',
    });
  }
}

/**
 * Create a user, and show their password exactly once.
 *
 * There is no mail transport here, so the administrator reads the password off
 * the screen and passes it on. It is generated rather than chosen for the same
 * reason: a password an administrator invents for someone else is one they know.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const parsed = validateRequest(createUserSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid user', formatValidationErrors(parsed.errors));
    }
    const { name, email } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Not 409-with-detail: this endpoint is admin-only, so saying the address
      // is taken costs nothing and saves a confused second attempt.
      return validationError('That email address already has an account', {
        email: ['Already in use'],
      });
    }

    const password = generatePassword();
    const user = await prisma.user.create({
      data: { name, email, role: CREATED_ROLE, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role },
    });

    // The only time the password leaves this process.
    return NextResponse.json({ user, password }, { status: 201 });
  } catch (error) {
    return createErrorResponse(error, 'Failed to create user', {
      endpoint: '/api/admin/users',
      method: 'POST',
    });
  }
}
