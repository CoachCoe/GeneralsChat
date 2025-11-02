import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { processDocument } from '@/lib/utils/documentProcessor';
import { PolicyType } from '@/types';

export async function GET(request: NextRequest) {
  try {
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
      // Process uploaded file
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = `${Date.now()}-${file.name}`;
      const uploadPath = `${process.env.UPLOADS_DIR || './uploads'}/${filename}`;
      
      // Save file
      await require('fs').promises.writeFile(uploadPath, buffer);
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
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}
