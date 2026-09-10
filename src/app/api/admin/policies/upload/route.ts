import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { processDocument } from '@/lib/utils/documentProcessor';
import { safeFetchText, UnsafeUrlError } from '@/lib/safe-fetch';
import {
  assertAllowedExtension,
  assertIndexablePolicyText,
  assertWithinSizeLimit,
  maxUploadBytes,
  readCappedFormData,
  safeUploadPath,
  UploadError,
  uploadErrorStatus,
  policyUploadsDir,
} from '@/lib/uploads';
import { requireRole } from '@/lib/session';
import { policyFacetsSchema } from '@/lib/validation';
import { validationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';

/** Formats the documentProcessor can actually parse. */
// `.doc` is not here. The extractor read the legacy OLE2 binary as UTF-8, so
// the "policy text" it produced was mojibake that got chunked and became
// retrievable, citable policy. Rejecting at the boundary gives the operator a
// message they can act on rather than a silently corrupt library entry.
// Attachments still accept `.doc`: those are stored and served back verbatim,
// never extracted or retrieved.
const ALLOWED_POLICY_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'] as const;

// POST /api/admin/policies/upload - Upload policy file or fetch from URL
export async function POST(request: NextRequest) {
  try {
    // Admin-only. middleware.ts also gates /api/admin/*, but a matcher
    // mistake must not silently expose policy or prompt mutation.
    const guard = await requireRole('admin');
    if (!guard.ok) return guard.response;

    const limited = enforceRateLimit(`policy-upload:${guard.user.id}`, RATE_LIMITS.UPLOAD);
    if (limited) return limited;

    // Capped read, not `request.formData()`: the body is bounded before it is
    // parsed, so an oversized POST costs the ceiling and not its own size.
    const formData = await readCappedFormData(request);
    const file = formData.get('file') as File | null;
    const url = formData.get('url') as string | null;
    const title = formData.get('title') as string;
    const facets = policyFacetsSchema.safeParse({
      jurisdiction: formData.get('jurisdiction'),
      category: formData.get('category'),
    });
    if (!facets.success) {
      return validationError(
        'Jurisdiction and category must each be one of the known values',
        facets.error.flatten().fieldErrors
      );
    }
    const { jurisdiction, category } = facets.data;
    const effectiveDate = formData.get('effectiveDate') as string;
    const keywords = formData.get('keywords') as string;

    if (!title || !effectiveDate) {
      return NextResponse.json(
        { error: 'Title and effectiveDate are required' },
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

    if (file) {
      // Validate type and size BEFORE anything touches the disk, or a rejected
      // upload still lands on the filesystem.
      const ext = assertAllowedExtension(file.name, ALLOWED_POLICY_EXTENSIONS);
      assertWithinSizeLimit(file);

      const uploadsDir = policyUploadsDir();
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
        // PDF and DOCX are parsed by documentProcessor.
        const processed = await processDocument(filePath);
        content = processed.content;
      }
    }
    else if (url) {
      // Guarded fetch: https only, non-public addresses refused, redirects
      // re-validated per hop, body size and time capped. A bare fetch() here
      // was an unauthenticated SSRF oracle whose response was stored and
      // readable back out via GET /api/admin/policies/<id>.
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

    // Rejecting after the write would leave the file on disk with no Policy row
    // pointing at it -- the exact rule stated forty lines above.
    try {
      assertIndexablePolicyText(content);
    } catch (error) {
      if (filePath) await unlink(filePath).catch(() => {});
      throw error;
    }

    const keywordsArray = keywords ? keywords.split(',').map(k => k.trim()) : [];

    // Created inactive. Indexing happens after the row exists -- it needs the
    // id -- and `addPolicyDocument` writes through the global client, so the
    // two cannot share a transaction. If indexing then failed, the old code
    // left an **active** policy with zero chunks behind a 500: invisible to
    // retrieval, but counted as loaded by the library page, and exactly the
    // state `policy-coverage.ts` exists to warn about ("a row with no chunks
    // is invisible to retrieval, so counting it would claim coverage the
    // system cannot deliver"). Activating only after the chunks land means a
    // failure leaves nothing that claims coverage.
    const policy = await prisma.policy.create({
      data: {
        title,
        content,
        filePath,
        jurisdiction,
        category,
        effectiveDate: new Date(effectiveDate),
        metadata: JSON.stringify({
          keywords: keywordsArray,
          uploadedVia: file ? 'file' : 'url',
          originalSource: url || file?.name,
        }),
        isActive: false,
        version: 1
      }
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'policy',
      entityId: policy.id,
      details: { title: policy.title, jurisdiction: policy.jurisdiction, category: policy.category },
    });

    // Indexed through the RAG system, which applies the documented 1000-word /
    // 200-word-overlap split AND generates embeddings + Chroma entries. The
    // previous inline `content.match(/.{1,500}/g)` chunker was wrong three
    // ways: `.` excludes \n without the s flag, so String.match returned one
    // match per LINE and dropped the newlines entirely (a policy with 60-char
    // lines became hundreds of 60-char fragments); there was no overlap, so any
    // requirement spanning a boundary was severed; and writing PolicyChunk rows
    // directly left `embedding` null and Chroma untouched, making
    // admin-uploaded policies invisible to vector search.
    let chunksCreated = 0;
    try {
      await ragSystem.addPolicyDocument(policy.id, content, {
        title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        effectiveDate,
        keywords: keywordsArray,
      });

      chunksCreated = await prisma.policyChunk.count({
        where: { policyId: policy.id },
      });

      // A chunkless policy is unretrievable, so it must not go active. This is
      // the same predicate `buildCoverageReport` uses to decide whether a row
      // counts as coverage at all.
      if (chunksCreated === 0) {
        throw new UploadError(
          'The document was stored but produced no searchable chunks, so it would be invisible to retrieval. It has not been activated.',
          422
        );
      }

      await prisma.policy.update({
        where: { id: policy.id },
        data: { isActive: true },
      });
    } catch (error) {
      // Leave nothing behind that claims coverage it cannot deliver.
      await prisma.policyChunk.deleteMany({ where: { policyId: policy.id } }).catch(() => {});
      await prisma.policy.delete({ where: { id: policy.id } }).catch(() => {});
      if (filePath) await unlink(filePath).catch(() => {});
      throw error;
    }

    return NextResponse.json({
      success: true,
      policy: {
        id: policy.id,
        title: policy.title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        effectiveDate: policy.effectiveDate,
      },
      chunksCreated
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
