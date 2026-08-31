import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { processDocument } from '@/lib/utils/documentProcessor';
import { safeFetchText, UnsafeUrlError } from '@/lib/safe-fetch';
import {
  assertAllowedExtension,
  assertWithinSizeLimit,
  maxUploadBytes,
  safeUploadPath,
  UploadError,
  uploadErrorStatus,
} from '@/lib/uploads';

/** Formats the documentProcessor can actually parse. */
const ALLOWED_POLICY_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.doc'] as const;

// POST /api/admin/policies/upload - Upload policy file or fetch from URL
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const url = formData.get('url') as string | null;
    const title = formData.get('title') as string;
    const policyType = formData.get('policyType') as string;
    const effectiveDate = formData.get('effectiveDate') as string;
    const keywords = formData.get('keywords') as string;

    // Validation
    if (!title || !policyType || !effectiveDate) {
      return NextResponse.json(
        { error: 'Title, policyType, and effectiveDate are required' },
        { status: 400 }
      );
    }

    if (!file && !url) {
      return NextResponse.json(
        { error: 'Either file or URL must be provided' },
        { status: 400 }
      );
    }

    let content = '';
    let filePath = null;

    // Handle file upload
    if (file) {
      // Validate type and size BEFORE anything touches the disk. Previously
      // the file was written first and the extension checked afterwards, so a
      // rejected upload still landed on the filesystem. (SEC-2, SEC-10)
      const ext = assertAllowedExtension(file.name, ALLOWED_POLICY_EXTENSIONS);
      assertWithinSizeLimit(file);

      const uploadsDir = join(process.cwd(), 'uploads', 'policies');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      // Server-generated basename: `file.name` is never part of the path.
      filePath = safeUploadPath(uploadsDir, ext);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      if (ext === '.txt' || ext === '.md') {
        content = buffer.toString('utf-8');
      } else {
        // PDF and DOCX are parsed by documentProcessor, which has always
        // supported both -- this route just never called it. (FLOW-21/SPEC-7)
        const processed = await processDocument(filePath);
        content = processed.content;
      }
    }
    // Handle URL fetch
    else if (url) {
      // Guarded fetch: https only, non-public addresses refused, redirects
      // re-validated per hop, body size and time capped. A bare fetch() here
      // was an unauthenticated SSRF oracle whose response was stored and
      // readable back out via GET /api/admin/policies/<id>. (SEC-4)
      try {
        content = await safeFetchText(url, { maxBytes: maxUploadBytes() });
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json(
          { error: 'Failed to fetch content from the provided URL' },
          { status: 400 }
        );
      }
    }

    // Create policy
    const keywordsArray = keywords ? keywords.split(',').map(k => k.trim()) : [];

    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        filePath,
        policyType,
        effectiveDate: new Date(effectiveDate),
        metadata: JSON.stringify({
          keywords: keywordsArray,
          uploadedVia: file ? 'file' : 'url',
          originalSource: url || file?.name,
        }),
        isActive: true,
        version: 1
      }
    });

    // Create chunks (500 chars per chunk)
    const chunkSize = 500;
    const chunks = content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];

    for (let i = 0; i < chunks.length; i++) {
      await prisma.policyChunk.create({
        data: {
          policyId: policy.id,
          content: chunks[i],
          chunkIndex: i,
          metadata: JSON.stringify({
            keywords: keywordsArray,
          }),
        }
      });
    }

    return NextResponse.json({
      success: true,
      policy: {
        id: policy.id,
        title: policy.title,
        policyType: policy.policyType,
        effectiveDate: policy.effectiveDate,
      },
      chunksCreated: chunks.length
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading policy:', error);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to upload policy' },
      { status: uploadErrorStatus(error) }
    );
  }
}
