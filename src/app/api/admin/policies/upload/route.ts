import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Save file to uploads directory
      const uploadsDir = join(process.cwd(), 'uploads', 'policies');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const fileName = `${Date.now()}-${file.name}`;
      filePath = join(uploadsDir, fileName);
      await writeFile(filePath, buffer);

      // Extract text based on file type
      const fileExt = file.name.split('.').pop()?.toLowerCase();

      if (fileExt === 'txt' || fileExt === 'md') {
        content = buffer.toString('utf-8');
      } else if (fileExt === 'pdf') {
        // For PDF, we'll need to use a PDF parser
        // For now, return an error asking to use text format
        return NextResponse.json(
          { error: 'PDF parsing not yet implemented. Please convert to .txt first or paste content directly.' },
          { status: 400 }
        );
      } else if (fileExt === 'docx' || fileExt === 'doc') {
        // For DOCX, we'll need to use a DOCX parser
        return NextResponse.json(
          { error: 'DOCX parsing not yet implemented. Please convert to .txt first or paste content directly.' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: 'Unsupported file type. Please use .txt, .md format.' },
          { status: 400 }
        );
      }
    }
    // Handle URL fetch
    else if (url) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }
        content = await response.text();
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to fetch content from URL: ${error}` },
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
    return NextResponse.json(
      { error: 'Failed to upload policy' },
      { status: 500 }
    );
  }
}
