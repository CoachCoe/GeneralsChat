import { afterEach, describe, expect, it } from 'vitest';
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
