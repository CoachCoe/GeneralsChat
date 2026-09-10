import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { prisma } from '@/lib/db';
import { canReadAllIncidents, requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { attachmentUploadsDir } from '@/lib/uploads';

type Params = { params: Promise<{ id: string }> };

/**
 * Authenticated attachment download.
 *
 * The only way to read an attachment. Anything under public/ is served as a
 * static asset with no access check, and a file path handed out by
 * GET /api/incidents/[id] would let anyone fetch the witness statements and
 * medical notes in a Title IX file directly.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { incident: { select: { reporterId: true } } },
    });

    if (!attachment) return notFoundError('Attachment');

    // Reporters may read only attachments on incidents they filed. Having
    // uploaded the file is not a grant: access follows current scope, or a
    // user keeps a student record after losing the incident it belongs to.
    const permitted =
      canReadAllIncidents(guard.user) || attachment.incident?.reporterId === guard.user.id;

    // 404 rather than 403: do not confirm the id exists to someone who may
    // not read it.
    if (!permitted) return notFoundError('Attachment');

    const uploadsDir = attachmentUploadsDir();
    const filePath = join(uploadsDir, attachment.filePath);

    // filePath is a server-generated basename, but assert containment anyway
    // so a bad row can never read outside the attachment directory.
    if (!resolve(filePath).startsWith(resolve(uploadsDir) + sep)) {
      return notFoundError('Attachment');
    }

    const data = await readFile(filePath);

    await recordAudit({
      userId: guard.user.id,
      action: 'viewed',
      entity: 'attachment',
      entityId: attachment.id,
      details: { incidentId: attachment.incidentId, filename: attachment.filename },
    });

    return new NextResponse(new Uint8Array(data), {
      headers: {
        // Always download, never render: an uploaded document must not execute
        // as markup on this origin even if the extension allowlist is widened.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to read attachment', {
      endpoint: '/api/attachments/[id]',
      method: 'GET',
    });
  }
}
