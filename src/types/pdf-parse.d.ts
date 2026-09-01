/**
 * Types for pdf-parse's library entry point.
 *
 * `@types/pdf-parse` declares the package root, but the root cannot be
 * imported: its index.js runs a debug harness that reads a test fixture the
 * package does not ship. We import `pdf-parse/lib/pdf-parse.js` instead, which
 * has no shipped types, so the same shape is declared here.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdfParse;
}
