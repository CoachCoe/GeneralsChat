import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve, sep } from 'path';
import {
  assertAllowedExtension,
  attachmentUploadsDir,
  policyUploadsDir,
  uploadsRoot,
  assertIndexablePolicyText,
  assertWithinSizeLimit,
  DEFAULT_MAX_UPLOAD_BYTES,
  fileExtension,
  readCappedFormData,
  safeUploadPath,
  UploadError,
} from './uploads';

/**
 * The audit found two arbitrary-file-write holes here: both upload paths built
 * their destination from the user-supplied filename, and a `../` name escaped
 * the uploads directory. Under the shipped container that was RCE. These are
 * the regression tests for that.
 */
const DIR = '/app/uploads/policies';

const TRAVERSALS = [
  '../../../../../../../../tmp/pwned.txt',
  '..\\..\\..\\windows\\system32\\evil.txt',
  '/etc/passwd',
  './../../secret.md',
  'a/b/c/../../../../../../etc/hosts',
];

describe('safeUploadPath', () => {
  it('never lets a traversal filename escape the directory', () => {
    for (const name of TRAVERSALS) {
      const path = safeUploadPath(DIR, fileExtension(name));
      expect(resolve(path).startsWith(resolve(DIR) + sep), `escaped for ${name}`).toBe(true);
    }
  });

  it('does not put any part of the caller-supplied name in the path', () => {
    const path = safeUploadPath(DIR, fileExtension('../../pwned.txt'));
    expect(path).not.toContain('pwned');
    expect(path).not.toContain('..');
  });

  it('generates a distinct name each time, so uploads cannot overwrite', () => {
    const a = safeUploadPath(DIR, '.pdf');
    const b = safeUploadPath(DIR, '.pdf');
    expect(a).not.toBe(b);
  });

  it('keeps the validated extension', () => {
    expect(safeUploadPath(DIR, '.pdf').endsWith('.pdf')).toBe(true);
  });
});

describe('fileExtension', () => {
  it('lowercases, so an allowlist cannot be bypassed by case', () => {
    expect(fileExtension('POLICY.PDF')).toBe('.pdf');
    expect(fileExtension('policy.PdF')).toBe('.pdf');
  });

  it('takes only the final extension of a double-barrelled name', () => {
    // `evil.pdf.html` must be judged as .html, not .pdf.
    expect(fileExtension('evil.pdf.html')).toBe('.html');
  });

  it('returns empty for a name with no extension', () => {
    expect(fileExtension('README')).toBe('');
  });
});

describe('assertAllowedExtension', () => {
  const allowed = ['.pdf', '.docx', '.txt'] as const;

  it('accepts an allowed type and returns the normalised extension', () => {
    expect(assertAllowedExtension('Policy.PDF', allowed)).toBe('.pdf');
  });

  it('rejects a disallowed type with a 400', () => {
    try {
      assertAllowedExtension('payload.html', allowed);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UploadError);
      expect((e as UploadError).status).toBe(400);
    }
  });

  it('rejects an extensionless name rather than defaulting', () => {
    expect(() => assertAllowedExtension('policy', allowed)).toThrow(UploadError);
  });

  it('is not fooled by a disallowed type hidden behind an allowed one', () => {
    // This is the stored-XSS vector: an .html served from the app's origin.
    expect(() => assertAllowedExtension('report.pdf.html', allowed)).toThrow(UploadError);
  });
});

describe('assertWithinSizeLimit', () => {
  const file = (size: number) => ({ size }) as File;

  it('accepts a file at exactly the limit', () => {
    expect(() => assertWithinSizeLimit(file(DEFAULT_MAX_UPLOAD_BYTES))).not.toThrow();
  });

  it('rejects one byte over, with a 413', () => {
    try {
      assertWithinSizeLimit(file(DEFAULT_MAX_UPLOAD_BYTES + 1));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UploadError);
      expect((e as UploadError).status).toBe(413);
    }
  });
});

describe('assertIndexablePolicyText', () => {
  // Retrieval works from chunks and chunks come from this text, so a policy
  // with none is invisible to search while still counting as loaded. There are
  // three ingestion routes; this is the rule all three call. (B5)

  it('accepts text that will produce chunks', () => {
    expect(() => assertIndexablePolicyText('Staff must report within 24 hours.')).not.toThrow();
  });

  it('rejects an extraction that produced nothing', () => {
    // What a scanned PDF yields.
    expect(() => assertIndexablePolicyText('')).toThrow(/No text could be extracted/);
  });

  it('rejects whitespace, which a truthiness check would let through', () => {
    // The JSON route guards with `!content`, which passes for all of these.
    for (const blank of ['   ', '\n\n', '\t', ' \n \t ']) {
      expect(() => assertIndexablePolicyText(blank)).toThrow(/No text could be extracted/);
    }
  });

  it('reports 422, not 500', () => {
    // The document is readable and the request well-formed; the content is the
    // problem, so this is the caller's to fix.
    try {
      assertIndexablePolicyText('');
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(422);
    }
  });
});

describe('uploads directory resolution', () => {
  const original = process.env.UPLOADS_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = original;
  });

  it('honours an absolute UPLOADS_DIR instead of prefixing the working directory', () => {
    // The bug this replaces: join(cwd, '/app/uploads', 'attachments') gives
    // /app/app/uploads/attachments. On a container platform that is outside
    // the mounted volume, so every attachment -- student records -- is
    // destroyed on the next revision. Upload and download shared the same
    // wrong expression, so nothing failed until a redeploy. (OQ-2, DEAD-62)
    process.env.UPLOADS_DIR = '/srv/files';
    expect(uploadsRoot()).toBe('/srv/files');
    expect(attachmentUploadsDir()).toBe('/srv/files/attachments');
    expect(policyUploadsDir()).toBe('/srv/files/policies');
  });

  it('resolves a relative UPLOADS_DIR against the working directory', () => {
    process.env.UPLOADS_DIR = './uploads';
    expect(policyUploadsDir()).toBe(resolve(process.cwd(), 'uploads', 'policies'));
  });

  it('defaults to ./uploads when unset', () => {
    delete process.env.UPLOADS_DIR;
    expect(uploadsRoot()).toBe(resolve(process.cwd(), 'uploads'));
  });

  it('keeps policies and attachments apart under one root', () => {
    process.env.UPLOADS_DIR = '/srv/files';
    expect(policyUploadsDir()).not.toBe(attachmentUploadsDir());
    for (const dir of [policyUploadsDir(), attachmentUploadsDir()]) {
      expect(dir.startsWith(uploadsRoot() + sep)).toBe(true);
    }
  });
});

describe('readCappedFormData', () => {
  // The hole this closes: both upload routes called `request.formData()` and
  // then checked `file.size`. The check was accurate and useless -- parsing had
  // already read the whole body into memory. Size limits rejected the file; the
  // memory was spent either way. (SEC-10)

  const original = process.env.MAX_FILE_SIZE;

  // Small enough that a test can exceed it in a few kilobytes, so these run in
  // milliseconds rather than allocating tens of megabytes.
  const LIMIT = 4096;
  const OVERHEAD = 64 * 1024;
  const CEILING = LIMIT + OVERHEAD;
  const CHUNK = 64 * 1024;

  beforeEach(() => {
    process.env.MAX_FILE_SIZE = String(LIMIT);
  });

  afterEach(() => {
    if (original === undefined) delete process.env.MAX_FILE_SIZE;
    else process.env.MAX_FILE_SIZE = original;
  });

  /** A real multipart body, built the way the browser builds one. */
  async function multipart(fileBytes: number) {
    const form = new FormData();
    form.set('incidentId', 'inc-1');
    form.set('file', new File([new Uint8Array(fileBytes)], 'statement.pdf'));
    const encoded = new Request('http://x/upload', { method: 'POST', body: form });
    return {
      headers: encoded.headers,
      body: encoded.body,
    };
  }

  /**
   * A body that keeps producing megabytes and reports how many it got to emit.
   * `declaredLength` is what the request *claims*, which is not necessarily
   * what it sends -- an attacker controls both independently.
   */
  function endlessBody(chunks: number, declaredLength?: number) {
    const emitted = { chunks: 0 };
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (emitted.chunks >= chunks) {
            controller.close();
            return;
          }
          emitted.chunks += 1;
          controller.enqueue(new Uint8Array(CHUNK));
        },
      },
      // highWaterMark 0 so the stream produces nothing until it is read from.
      // At the default of 1 it eagerly fills a chunk on construction, and
      // `emitted` would then count a byte nobody asked for.
      { highWaterMark: 0 }
    );
    const headers = new Headers({
      'content-type': 'multipart/form-data; boundary=----x',
    });
    if (declaredLength !== undefined) {
      headers.set('content-length', String(declaredLength));
    }
    return { request: { headers, body }, emitted };
  }

  it('reads a body that fits, and returns its fields', async () => {
    const form = await readCappedFormData(await multipart(1024));
    expect(form.get('incidentId')).toBe('inc-1');
    expect((form.get('file') as File).size).toBe(1024);
  });

  it('rejects a declared Content-Length over the ceiling with a 413', async () => {
    const { request, emitted } = endlessBody(1000, CEILING + 1);
    await expect(readCappedFormData(request)).rejects.toMatchObject({
      status: 413,
    });
    // Rejected on the header alone: not one byte of the body was read.
    expect(emitted.chunks).toBe(0);
  });

  it('rejects a body that exceeds the ceiling while declaring nothing', async () => {
    // Chunked transfer encoding sends no Content-Length, so the header check
    // cannot see this one coming. Only the counting stream can.
    const { request } = endlessBody(1000);
    await expect(readCappedFormData(request)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('rejects a body that exceeds the ceiling while declaring it is small', async () => {
    const { request } = endlessBody(1000, 512);
    await expect(readCappedFormData(request)).rejects.toMatchObject({
      status: 413,
    });
  });

  /**
   * The property the whole change exists for, and the one the old code did not
   * have: what a request costs the process is decided by the ceiling, not by
   * the client. A body claiming 512 bytes and sending 64MB must be stopped
   * mid-flight, so how much gets read cannot depend on how much is offered.
   */
  it('reads the same bounded amount however much the body offers', async () => {
    const small = endlessBody(200, 512); //  12MB on offer
    const huge = endlessBody(20_000, 512); // 1.2GB on offer

    await expect(readCappedFormData(small.request)).rejects.toMatchObject({ status: 413 });
    await expect(readCappedFormData(huge.request)).rejects.toMatchObject({ status: 413 });

    expect(huge.emitted.chunks).toBe(small.emitted.chunks);
    // The ceiling plus the pipeline's own in-flight buffering -- a fixed
    // overhead of a chunk or two, not a function of the 1.2GB offered.
    expect(huge.emitted.chunks * CHUNK).toBeLessThan(CEILING + 4 * CHUNK);
  });

  it('rejects a request with no body at all', async () => {
    const request = {
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=--x' }),
      body: null,
    };
    await expect(readCappedFormData(request)).rejects.toMatchObject({ status: 400 });
  });

  it('reports a malformed body as a 400, not a 500', async () => {
    const request = {
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=----x' }),
      body: new Response('not multipart at all').body,
    };
    await expect(readCappedFormData(request)).rejects.toMatchObject({ status: 400 });
  });
});
