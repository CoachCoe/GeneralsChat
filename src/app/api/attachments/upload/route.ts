import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  assertAllowedExtension,
  assertWithinSizeLimit,
  readCappedFormData,
  safeUploadPath,
  UploadError,
  attachmentUploadsDir,
} from '@/lib/uploads';
import { incidentScope, requireUser } from '@/lib/session';
import { enforceRateLimit } from '@/lib/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Deliberately excludes .html/.svg/.xhtml: these files are served from
 * `public/` on the app's own origin, so an uploaded document that the
 * browser executes as markup is stored XSS. (SEC-5)
 */
const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx', '.csv',
] as const;

export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const limited = enforceRateLimit(`upload:${guard.user.id}`, RATE_LIMITS.UPLOAD);
    if (limited) return limited;

    // Capped read, not `request.formData()`: the body is bounded before it is
    // parsed, so an oversized POST costs the ceiling and not its own size.
    // (SEC-10)
    const formData = await readCappedFormData(request);
    const file = formData.get('file') as File;
    const incidentId = formData.get('incidentId') as string;

    if (!file || !incidentId) {
      return NextResponse.json(
        { error: 'File and incidentId are required' },
        { status: 400 }
      );
    }

    // Verify the incident exists AND that this user may attach to it. (SEC-7)
    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, ...incidentScope(guard.user) },
    });

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Type, then the exact per-file limit. The memory bound was applied by
    // readCappedFormData above; this is the limit itself. (SEC-5, SEC-10)
    const ext = assertAllowedExtension(file.name, ALLOWED_ATTACHMENT_EXTENSIONS);
    assertWithinSizeLimit(file);

    // Deliberately NOT public/. Attachments are student-record material --
    // witness statements, medical notes, photographs on a Title IX file. Under
    // public/ they were served as static assets with no access check, so the
    // path handed out by GET /api/incidents/[id] was a direct download link for
    // anyone. They are now written outside the served tree and read back only
    // through GET /api/attachments/[id], which re-checks the session. (SEC-5)
    const uploadsDir = attachmentUploadsDir();
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const filePath = safeUploadPath(uploadsDir, ext);
    const storedName = filePath.slice(uploadsDir.length + 1);

    // Write file to disk
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    // Save attachment record to database
    const attachment = await prisma.attachment.create({
      data: {
        incidentId,
        filename: file.name,
        // Stored name only. The download URL is derived from the row id, so
        // the on-disk layout is never exposed to the client.
        filePath: storedName,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: guard.user.id,
      },
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error('File upload error:', error);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
