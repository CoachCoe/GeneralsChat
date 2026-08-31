import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  assertAllowedExtension,
  assertWithinSizeLimit,
  safeUploadPath,
  UploadError,
} from '@/lib/uploads';

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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const incidentId = formData.get('incidentId') as string;

    if (!file || !incidentId) {
      return NextResponse.json(
        { error: 'File and incidentId are required' },
        { status: 400 }
      );
    }

    // Verify incident exists
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Validate type and size before buffering the body. (SEC-5, SEC-10)
    const ext = assertAllowedExtension(file.name, ALLOWED_ATTACHMENT_EXTENSIONS);
    assertWithinSizeLimit(file);

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const filePath = safeUploadPath(uploadsDir, ext);
    const uniqueFileName = filePath.slice(uploadsDir.length + 1);

    // Write file to disk
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    // Save attachment record to database
    // Using demo-user as default uploader for now
    const attachment = await prisma.attachment.create({
      data: {
        incidentId,
        filename: file.name,
        filePath: `/uploads/${uniqueFileName}`,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: 'demo-user', // TODO: Get from authenticated user session
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
