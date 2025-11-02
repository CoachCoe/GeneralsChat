import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = join(uploadsDir, uniqueFileName);

    // Write file to disk
    await writeFile(filePath, buffer);

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
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
