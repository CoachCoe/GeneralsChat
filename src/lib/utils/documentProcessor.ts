import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

// Lazy load these to avoid initialization errors
let pdf: any = null;
let mammoth: any = null;

export interface ProcessedDocument {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    fileType: string;
    extractedAt: Date;
  };
}

export async function processDocument(filePath: string): Promise<ProcessedDocument> {
  const fileExtension = getFileExtension(filePath);
  const fileBuffer = await readFile(filePath);

  let content: string;
  const metadata: any = {
    fileType: fileExtension,
    extractedAt: new Date(),
  };

  try {
    switch (fileExtension) {
      case '.pdf':
        if (!pdf) {
          // Import the library entry point, not the package root.
          // pdf-parse's index.js runs a debug harness on require that reads
          // ./test/data/05-versions-space.pdf -- a fixture it does not ship --
          // so importing the root throws ENOENT and every PDF upload fails.
          // This only shows up against a real PDF, which is why it survived
          // being "wired in" during the audit.
          pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
        }
        const pdfData = await pdf(fileBuffer);
        content = pdfData.text;
        metadata.pageCount = pdfData.numpages;
        break;

      case '.docx':
        if (!mammoth) {
          mammoth = await import('mammoth');
        }
        const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
        content = docxResult.value;
        break;
        
      case '.doc':
        // For .doc files, we'd need a different library like 'mammoth' with doc support
        // For now, we'll treat it as text
        content = fileBuffer.toString('utf-8');
        break;
        
      case '.txt':
        content = fileBuffer.toString('utf-8');
        break;
        
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
    
    // Clean up the content
    content = cleanText(content);
    metadata.wordCount = countWords(content);
    
    return {
      content,
      metadata,
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getFileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  // No dot, or a dot that belongs to a directory rather than the filename
  // ("/etc/my.dir/README"). lastIndexOf alone returned the whole path here,
  // producing an unsupported-type error naming the entire path.
  if (dot === -1 || dot < slash) return '';
  return filePath.toLowerCase().substring(dot);
}

/**
 * Normalise extracted text while keeping paragraph structure.
 *
 * The previous implementation collapsed all whitespace to single spaces on its
 * first line, which destroyed every newline -- so the "remove excessive
 * newlines" rule two lines later could never fire, and policy documents lost
 * their paragraph breaks before ever being chunked or shown to the model.
 */
export function cleanText(text: string): string {
  return text
    // Page breaks and form feeds carry no meaning once extracted.
    .replace(/[\f\v]/g, '')
    // Normalise line endings before any newline-sensitive rule runs.
    .replace(/\r\n?/g, '\n')
    // Collapse runs of spaces and tabs, but not newlines.
    .replace(/[^\S\n]+/g, ' ')
    // Strip trailing spaces left on a line by the rule above.
    .replace(/ +\n/g, '\n')
    // Three or more blank lines become one paragraph break.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * `''.split(/\s+/)` yields `['']`, so the naive length reported one word for an
 * empty document -- which made a failed extraction look like a successful one.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const processed = await processDocument(filePath);
  return processed.content;
}

/**
 * Split text into overlapping chunks, by word.
 *
 * The overlap is what stops a requirement that spans a boundary from being
 * severed, so consecutive chunks share exactly `overlap` words.
 *
 * Stops once a chunk reaches the end of the text. Without that check the loop
 * kept stepping while fewer words remained than the overlap, emitting a final
 * chunk wholly contained in the previous one -- a duplicate that cost an
 * embedding, a database row and a slot in the top-N at retrieval, while adding
 * nothing. A 2500-word document produced four chunks where three suffice.
 */
export function splitIntoChunks(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  if (overlap >= chunkSize) {
    throw new Error(`overlap (${overlap}) must be smaller than chunkSize (${chunkSize})`);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const step = chunkSize - overlap;
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + chunkSize).join(' ').trim();
    if (chunk) chunks.push(chunk);
    // This chunk already reached the end; anything further would be a subset.
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

export function extractKeywords(text: string): string[] {
  // Simple keyword extraction - in production, use more sophisticated NLP
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  // Count word frequency
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Return top keywords
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}

export interface SectionedChunk {
  content: string;
  sectionLabel?: string;
  sectionTitle?: string;
  sectionStatute?: string;
}

/**
 * Chunk a policy along its own section boundaries.
 *
 * Chunking blindly across a document produces chunks that straddle two
 * provisions, which cannot be cited: "somewhere between §E and §F" is not a
 * reference an administrator can act on. Splitting within sections means every
 * chunk belongs to exactly one, so it can carry that section's label and
 * statute.
 *
 * A section longer than `chunkSize` is still split, with overlap, inside
 * itself. Text before the first section -- title pages, adoption dates -- is
 * kept as unlabelled chunks rather than dropped, and a document with no
 * parseable structure falls back to plain chunking.
 */
export function splitPolicyIntoSectionedChunks(
  content: string,
  sections: { label: string; title: string; statute?: string; text: string }[],
  chunkSize = 1000,
  overlap = 200
): SectionedChunk[] {
  if (sections.length === 0) {
    return splitIntoChunks(content, chunkSize, overlap).map(c => ({ content: c }));
  }

  const out: SectionedChunk[] = [];

  // Front matter: everything before the first section still carries the policy
  // code and adoption dates, so it is worth retrieving even though unlabelled.
  const firstStart = content.indexOf(sections[0].text);
  if (firstStart > 0) {
    for (const c of splitIntoChunks(content.slice(0, firstStart), chunkSize, overlap)) {
      out.push({ content: c });
    }
  }

  for (const section of sections) {
    for (const c of splitIntoChunks(section.text, chunkSize, overlap)) {
      out.push({
        content: c,
        sectionLabel: section.label,
        sectionTitle: section.title,
        ...(section.statute ? { sectionStatute: section.statute } : {}),
      });
    }
  }

  return out;
}
