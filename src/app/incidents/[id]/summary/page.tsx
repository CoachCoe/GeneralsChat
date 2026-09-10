'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { GuidanceBlock } from '@/components/design/GuidanceBlock';
import { DocumentPage } from '@/components/design/DocumentPage';
import { useMounted } from '@/lib/useMounted';

interface Conversation {
  id: string;
  message: string;
  sender: string;
  timestamp: string;
}

interface Incident {
  id: string;
  title: string;
  conversations: Conversation[];
}

/**
 * The consultation summary as its own page: the artefact that goes into the
 * student's file, so it has an address and it prints.
 */
export default function SummaryPage() {
  const params = useParams();
  const incidentId = params.id as string;
  const mounted = useMounted();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/incidents/${incidentId}`);
    if (!response.ok) {
      setIncident(null);
      setLoading(false);
      return;
    }
    setIncident(await response.json());
    setLoading(false);
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/summary`, { method: 'POST' });
      if (!response.ok) {
        toast.error('Could not generate the summary. Try again.');
        return;
      }
      await load();
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Consultation" title="Loading summary">
        <p className="text-[14px] text-text-tertiary">One moment.</p>
      </DocumentPage>
    );
  }

  if (!incident) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Consultation" title="Incident not found">
        <p className="text-[14px] text-text-tertiary">
          This incident does not exist, or it is not yours to read.
        </p>
      </DocumentPage>
    );
  }

  // The most recent one: a summary is regenerated as the consultation goes on,
  // and the file wants the current reading, not the first.
  const summary = incident.conversations.filter(c => c.sender === 'summary').pop();

  return (
    <DocumentPage
      incidentId={incidentId}
      incidentTitle={incident.title}
      eyebrow="Confidential incident consultation summary"
      title={incident.title}
      meta={
        summary && mounted ? (
          <p className="font-mono text-[12px] tabular-nums text-text-muted">
            Generated{' '}
            {new Date(summary.timestamp).toLocaleString('en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        ) : null
      }
    >
      {summary ? (
        <div data-testid="incident-summary">
          <GuidanceBlock>{summary.message}</GuidanceBlock>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="text-[15px] leading-[1.6] text-text-secondary">
            No summary has been generated for this incident yet. It is written from the
            consultation, so there has to be one to summarise.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            data-print="hide"
            className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate Summary'}
          </button>
        </div>
      )}
    </DocumentPage>
  );
}
