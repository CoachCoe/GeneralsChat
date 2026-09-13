'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

/**
 * A page that is a document rather than a screen: printed, signed, filed.
 *
 * The frame around it -- the way back, the title, the print control -- is not
 * part of the document, so printing drops it (`theme.css`).
 */
/**
 * Taking a copy away.
 *
 * Built here from what the page already holds, rather than from a second server
 * route rendering the same records: one fewer path to a child's incident, and
 * one fewer access check to get wrong. `markdown` is a function so the work
 * happens on the click and not on every render.
 */
export interface DocumentDownload {
  filename: string;
  markdown: () => string;
}

function download({ filename, markdown }: DocumentDownload): void {
  const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next tick: Safari has not finished reading the blob when
  // click() returns, and a revoked URL downloads an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DocumentPage({
  incidentId,
  incidentTitle,
  eyebrow,
  title,
  meta,
  documentDownload,
  children,
}: {
  incidentId: string;
  incidentTitle?: string;
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  documentDownload?: DocumentDownload;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <div data-print="hide">
        <Navbar />
      </div>

      <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-6 py-10">
        <div className="flex items-center justify-between gap-4" data-print="hide">
          <Link
            href={`/incidents/${incidentId}`}
            className="text-[13px] text-text-muted hover:text-text"
          >
            ← {incidentTitle ?? 'Incident'}
          </Link>
          <div className="flex gap-2">
            {documentDownload && (
              <button
                type="button"
                onClick={() => download(documentDownload)}
                className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text"
              >
                Download
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text"
            >
              Print
            </button>
          </div>
        </div>

        <header className="flex flex-col gap-2 border-b border-line pb-5">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="font-display text-[32px] leading-[1.15] tracking-[-0.02em] text-text">
            {title}
          </h1>
          {meta}
        </header>

        {children}
      </main>
    </div>
  );
}
