'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

/**
 * A page that is a document rather than a screen: printed, signed, filed.
 *
 * The frame around it -- the way back, the title, the print control -- is not
 * part of the document, so printing drops it (`theme.css`).
 */
export function DocumentPage({
  incidentId,
  incidentTitle,
  eyebrow,
  title,
  meta,
  children,
}: {
  incidentId: string;
  incidentTitle?: string;
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
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
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text"
          >
            Print
          </button>
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
