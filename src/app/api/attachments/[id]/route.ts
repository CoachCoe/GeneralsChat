import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { prisma } from '@/lib/db';
import { canReadAllIncidents, requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * Authenticated attachment download.
 *
 * Attachments used to live under public/ and were therefore served as static
 * assets with no access check at all -- the file path was handed out by
 * GET /api/incidents/[id], so anyone could fetch witness statements and
 * medical notes from a Title IX file directly. This route is the only way to
 * read them now. (SEC-5)
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

    // Reporters may read only attachments on incidents they filed.
    const permitted =
      canReadAllIncidents(guard.user) ||
      attachment.incident?.reporterId === guard.user.id ||
      attachment.uploadedBy === guard.user.id;

    // 404 rather than 403: do not confirm the id exists to someone who may
    // not read it.
    if (!permitted) return notFoundError('Attachment');

    const uploadsDir = join(
      process.cwd(),
      process.env.UPLOADS_DIR || './uploads',
      'attachments'
    );
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
