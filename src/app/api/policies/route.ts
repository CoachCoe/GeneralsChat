import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { processDocument } from '@/lib/utils/documentProcessor';
import { PolicyType } from '@/types';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import {
  assertAllowedExtension,
  assertWithinSizeLimit,
  safeUploadPath,
  UploadError,
} from '@/lib/uploads';
import { requireRole, requireUser } from '@/lib/session';

const ALLOWED_POLICY_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.doc'] as const;

export async function GET(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(request.url);
    const policyType = searchParams.get('type');
    const isActive = searchParams.get('active');

    const where: any = {};
    if (policyType) {
      where.policyType = policyType;
    }
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    const policies = await prisma.policy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('Get policies error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Policy ingestion is an admin action. (SEC-6)
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const formData = await request.formData();
    const title = formData.get('title') as string;
    const policyType = formData.get('policyType') as PolicyType;
    const effectiveDate = formData.get('effectiveDate') as string;
    const file = formData.get('file') as File;

    if (!title || !policyType) {
      return NextResponse.json(
        { error: 'Title and policy type are required' },
        { status: 400 }
      );
    }

    let content = '';
    let filePath = '';

    if (file) {
      // Validate before writing. The previous implementation concatenated
      // `file.name` straight into the path, so a `../` filename escaped the
      // uploads directory entirely. (SEC-3, SEC-10)
      const ext = assertAllowedExtension(file.name, ALLOWED_POLICY_EXTENSIONS);
      assertWithinSizeLimit(file);

      const uploadsDir = process.env.UPLOADS_DIR || './uploads';
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const uploadPath = safeUploadPath(uploadsDir, ext);
      await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));
      filePath = uploadPath;

      // Extract text content
      const processed = await processDocument(uploadPath);
      content = processed.content;
    }

    // Create policy record
    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        filePath,
        policyType,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        isActive: true,
      },
    });

    // Add to RAG system for search with metadata
    if (content) {
      await ragSystem.addPolicyDocument(policy.id, content, {
        title,
        policyType,
        effectiveDate: effectiveDate || new Date().toISOString(),
      });
    }

    return NextResponse.json({ policy });
  } catch (error) {
    console.error('Create policy error:', error);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}
