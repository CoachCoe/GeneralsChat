'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DocumentPage } from '@/components/design/DocumentPage';
import { AuthorityChip } from '@/components/design/AuthorityChip';
import type { ReportBlock } from '@/lib/report-template';
import { INCIDENT_TYPE_LABELS } from '@/types';

interface Report {
  incidentTitle: string;
  form: { title: string; jurisdiction: string } | null;
  /** Why there is no form: the incident is unclassified, or none is loaded. */
  reason?: 'unclassified' | 'none-loaded';
  incidentType: string | null;
  blocks: ReportBlock[];
  counts: { filled: number; total: number };
}

/**
 * The district's form for this incident, with the record written into it.
 *
 * A draft: the administrator signs it, not the system.
 */
export default function ReportPage() {
  const params = useParams();
  const incidentId = params.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/incidents/${incidentId}/report`);
      if (response.ok) setReport(await response.json());
      setLoading(false);
    };
    load();
  }, [incidentId]);

  if (loading) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Mandatory report" title="Loading report">
        <p className="text-[14px] text-text-tertiary">One moment.</p>
      </DocumentPage>
    );
  }

  if (!report) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Mandatory report" title="Incident not found">
        <p className="text-[14px] text-text-tertiary">
          This incident does not exist, or it is not yours to read.
        </p>
      </DocumentPage>
    );
  }

  const typeLabel = report.incidentType
    ? (INCIDENT_TYPE_LABELS[report.incidentType as keyof typeof INCIDENT_TYPE_LABELS] ??
      report.incidentType)
    : null;

  if (!report.form) {
    return (
      <DocumentPage
        incidentId={incidentId}
        incidentTitle={report.incidentTitle}
        eyebrow="Mandatory report"
        title="No report form is loaded"
      >
        <div
          role="note"
          data-testid="report-gap"
          className="flex flex-col gap-1.5 rounded-[16px] border border-attention/40 bg-attention/[0.07] px-5 py-[18px]"
        >
          <span className="text-[15px] font-medium leading-[1.3] text-text">
            {report.reason === 'unclassified'
              ? 'This incident has not been classified yet.'
              : typeLabel
                ? `No district or school report form is loaded for a ${typeLabel.toLowerCase()} matter.`
                : 'No district or school report form is loaded for this incident.'}
          </span>
          <span className="text-[14px] leading-[1.6] text-text-secondary">
            {report.reason === 'unclassified'
              ? 'Which report applies depends on what the incident is. Describe it in chat: classification runs there, and the form follows from it.'
              : 'The library holds no form to fill out, so there is nothing here to prepare. Use the district’s own form, and ask an administrator to load it so the next report can be drafted from the record.'}
          </span>
        </div>
      </DocumentPage>
    );
  }

  return (
    <DocumentPage
      incidentId={incidentId}
      incidentTitle={report.incidentTitle}
      eyebrow="Mandatory report · draft"
      title={report.form.title}
      meta={
        <div className="flex flex-wrap items-center gap-3">
          <AuthorityChip jurisdiction={report.form.jurisdiction} />
          <span className="font-mono text-[12px] tabular-nums text-text-muted">
            {report.counts.filled} of {report.counts.total} fields filled from the record
          </span>
        </div>
      }
    >
      <div
        role="note"
        className="rounded-[16px] border border-attention/40 bg-attention/[0.07] px-5 py-[18px] text-[14px] leading-[1.6] text-text-secondary"
      >
        A draft, prepared from the incident record. Every filled field says where it came from;
        every blank is one this system cannot answer — names, ages, grades and dates of incident
        are in the reporter&apos;s account rather than in any field, and guessing them from prose
        is how a report names the wrong child. Check it, complete it, and file it under the
        district&apos;s own process.
      </div>

      <div data-testid="incident-report" className="flex flex-col gap-5">
        {report.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </DocumentPage>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h2 className="heading-md mt-3">{block.text}</h2>;

    case 'text':
      return <p className="body-text">{block.text}</p>;

    case 'field':
      return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[14px] text-text-secondary">{block.label}</span>
          <Value value={block.value} source={block.source} />
        </div>
      );

    case 'longField':
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] text-text-secondary">{block.label}</span>
          {block.value ? (
            <>
              <p className="whitespace-pre-wrap rounded-[12px] border border-line bg-surface px-4 py-3 text-[15px] leading-[1.6] text-text">
                {block.value}
              </p>
              <Source source={block.source} />
            </>
          ) : (
            <Rules count={4} />
          )}
        </div>
      );

    case 'choice':
      return (
        <div className="flex flex-col gap-1.5">
          {block.label && <span className="text-[14px] text-text-secondary">{block.label}</span>}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {block.options.map(option => (
              <li key={option} className="text-[14px] text-text-tertiary">
                ☐ {option}
              </li>
            ))}
          </ul>
        </div>
      );

    case 'lines':
      return <Rules count={block.count} />;
  }
}

function Value({ value, source }: { value?: string; source?: string }) {
  if (!value) return <span className="print-rule min-w-[220px] flex-1 border-b border-line-strong" />;

  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[15px] text-text">{value}</span>
      <Source source={source} />
    </span>
  );
}

function Source({ source }: { source?: string }) {
  if (!source) return null;
  return <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{source}</span>;
}

/** Space to write, on screen and on paper. */
function Rules({ count }: { count: number }) {
  return (
    <span className="flex flex-col gap-4 py-1">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="print-rule block border-b border-line-strong" />
      ))}
    </span>
  );
}
