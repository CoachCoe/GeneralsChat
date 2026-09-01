'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { StateBlock } from '@/components/design/StateBlock';
import { ObligationRow, type Obligation } from '@/components/design/ObligationRow';
import { GuidanceBlock } from '@/components/design/GuidanceBlock';
import { describeDeadline, DEADLINE_COLOR } from '@/lib/deadline';
import { INCIDENT_TYPE_LABELS } from '@/types';

interface Conversation {
  id: string;
  message: string;
  sender: string;
  timestamp: string;
}

interface Attachment {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

interface Action {
  id: string;
  actionType: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
}

interface Incident {
  id: string;
  title: string;
  description?: string;
  incidentType?: string;
  severity?: string;
  status: string;
  createdAt: string;
  closedAt?: string | null;
  reporter: { id: string; name: string; email: string };
  conversations: Conversation[];
  attachments: Attachment[];
  complianceActions?: Action[];
}

type TimelineEvent = {
  at: Date;
  kind: 'reported' | 'exchange' | 'attachment' | 'met' | 'missed' | 'upcoming';
  title: string;
  body?: string;
  meta?: string;
};

/**
 * Incident detail: what happened, what we did, what's left. (design 1g)
 *
 * The previous page was a flat dump -- description, a status toggle,
 * attachments, a summary button -- with no chronology and no sense of an
 * investigation in progress. This is a timeline built from what actually
 * exists: the intake exchange, attachments, and every obligation with its
 * deadline state.
 */
export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchIncident = useCallback(async () => {
    try {
      const response = await fetch(`/api/incidents/${incidentId}`);
      if (!response.ok) throw new Error('Could not load this incident.');
      setIncident(await response.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/summary`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary);
      }
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!incident) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: incident.status === 'closed' ? 'open' : 'closed' }),
      });
      if (response.ok) await fetchIncident();
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('incidentId', incidentId);
      const response = await fetch('/api/attachments/upload', { method: 'POST', body: formData });
      if (response.ok) await fetchIncident();
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const markObligationDone = async (id: string) => {
    const response = await fetch(`/api/obligations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    if (response.ok) await fetchIncident();
  };

  if (loading) {
    return (
      <Shell>
        <StateBlock variant="loading" title="Loading incident" />
      </Shell>
    );
  }

  if (error || !incident) {
    return (
      <Shell>
        <StateBlock
          variant="error"
          title="Could not load this incident"
          body={error ?? 'It may have been removed, or you may not have access to it.'}
          action={
            <Link href="/incidents" className="text-[14px] text-text underline underline-offset-2">
              Back to incidents
            </Link>
          }
        />
      </Shell>
    );
  }

  const actions = incident.complianceActions ?? [];
  const open = actions.filter(a => a.status !== 'completed');
  const done = actions.length - open.length;
  const overdue = open.filter(a => a.dueDate && new Date(a.dueDate).getTime() < Date.now());
  const closed = incident.status === 'closed';

  const events: TimelineEvent[] = [
    {
      at: new Date(incident.createdAt),
      kind: 'reported' as const,
      title: `Reported by ${incident.reporter?.name ?? 'unknown'}`,
      body: incident.description,
    },
    ...incident.conversations.map(c => ({
      at: new Date(c.timestamp),
      kind: 'exchange' as const,
      title: c.sender === 'user' ? 'Added by the reporter' : 'Guidance given',
      body: c.message,
      meta: c.sender,
    })),
    ...incident.attachments.map(a => ({
      at: new Date(a.createdAt),
      kind: 'attachment' as const,
      title: 'Attachment added',
      body: a.filename,
      meta: a.id,
    })),
    ...actions.map(a => {
      const info = describeDeadline(a.dueDate, a.status, a.completedAt);
      return {
        at: new Date(a.completedAt ?? a.dueDate ?? incident.createdAt),
        kind: (a.status === 'completed'
          ? 'met'
          : info.state === 'overdue'
            ? 'missed'
            : 'upcoming') as TimelineEvent['kind'],
        title: a.description || a.actionType,
        meta: `${info.label}${info.absolute ? ` · ${info.absolute}` : ''}`,
      };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <Shell>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/incidents" className="text-[13px] text-text-muted hover:text-text">
            ← Incidents
          </Link>
          {overdue.length > 0 && (
            <span className="rounded-full border border-overdue/50 px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-overdue">
              {overdue.length} overdue
            </span>
          )}
          <span className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-text-secondary">
            {incident.status}
          </span>
        </div>

        <h1 className="font-display text-[40px] leading-[1.15] tracking-[-0.03em] text-text">
          {incident.title}
        </h1>

        <p className="text-[14px] text-text-tertiary">
          {incident.incidentType
            ? (INCIDENT_TYPE_LABELS[incident.incidentType as keyof typeof INCIDENT_TYPE_LABELS] ??
               incident.incidentType)
            : 'Unclassified'}{' '}
          · filed by {incident.reporter?.name ?? 'unknown'},{' '}
          {new Date(incident.createdAt).toLocaleString('en-US', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
          >
            {generatingSummary ? 'Generating…' : 'Generate Summary'}
          </button>
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={updatingStatus}
            className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text disabled:opacity-50"
          >
            {closed ? 'Reopen Incident' : 'Close Incident'}
          </button>
        </div>
      </header>

      <StampBar incident={incident} done={done} total={actions.length} overdue={overdue.length} />

      <div className="flex flex-col gap-8 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="eyebrow">Timeline</span>
          <div className="flex flex-col gap-2">
            {events.map((event, i) => (
              <TimelineRow key={`${event.kind}-${i}`} event={event} />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="attach-file"
            />
            <label
              htmlFor="attach-file"
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text"
            >
              {uploadingFile ? 'Uploading…' : 'Attach'}
            </label>
          </div>

          {summary && (
            <div className="mt-4 flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
              <span className="eyebrow">Summary</span>
              <GuidanceBlock>{summary}</GuidanceBlock>
            </div>
          )}
        </section>

        <aside className="flex w-full flex-none flex-col gap-3 lg:w-[340px]">
          <span className="eyebrow">
            Obligations · {done} of {actions.length} done
          </span>
          {actions.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-5 text-[14px] text-text-tertiary">
              No obligations yet. They are created when the incident is classified.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {actions.map(a => (
                <ObligationRow
                  key={a.id}
                  obligation={{ ...a, incidentId: incident.id } as Obligation}
                  onDone={markObligationDone}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">{children}</main>
    </div>
  );
}

/** Where the incident has got to, at a glance. (design 1g) */
function StampBar({
  incident,
  done,
  total,
  overdue,
}: {
  incident: Incident;
  done: number;
  total: number;
  overdue: number;
}) {
  const stamps: { label: string; value: string; tone?: string }[] = [
    {
      label: 'Reported',
      value: new Date(incident.createdAt).toLocaleString('en-US', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }),
    },
    { label: 'Classified', value: incident.incidentType ? 'yes' : 'not yet' },
    {
      label: 'Obligations',
      value: total === 0 ? '—' : `${done} of ${total}`,
      tone: overdue > 0 ? 'text-overdue' : undefined,
    },
    {
      label: 'Closed',
      value: incident.closedAt
        ? new Date(incident.closedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
        : '—',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-4">
      {stamps.map(stamp => (
        <div key={stamp.label} className="flex flex-col gap-1 bg-surface px-4 py-3">
          <span className="eyebrow">{stamp.label}</span>
          <span className={`tabular text-[14px] ${stamp.tone ?? 'text-text-secondary'}`}>
            {stamp.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const KIND_TONE: Record<TimelineEvent['kind'], string> = {
  reported: 'bg-text-tertiary',
  exchange: 'bg-line-strong',
  attachment: 'bg-line-strong',
  met: 'bg-met',
  missed: 'bg-overdue',
  upcoming: 'bg-attention',
};

function TimelineRow({ event }: { event: TimelineEvent }) {
  const isAttachment = event.kind === 'attachment';
  return (
    <div className="flex gap-3 rounded-[12px] border border-line bg-surface px-4 py-3">
      <span className={`mt-2 h-2 w-2 flex-none rounded-full ${KIND_TONE[event.kind]}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-medium text-text">{event.title}</span>
          <span className="tabular text-[12px] text-text-muted">
            {event.at.toLocaleString('en-US', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {event.kind === 'missed' && (
            <span className={`tabular text-[12px] ${DEADLINE_COLOR.overdue}`}>{event.meta}</span>
          )}
          {event.kind === 'upcoming' && (
            <span className={`tabular text-[12px] ${DEADLINE_COLOR.attention}`}>{event.meta}</span>
          )}
        </div>
        {event.body && (
          isAttachment ? (
            <a
              href={`/api/attachments/${event.meta}`}
              className="w-fit text-[14px] text-text-secondary underline underline-offset-2 hover:text-text"
            >
              {event.body}
            </a>
          ) : (
            <p className="whitespace-pre-wrap text-[14px] leading-[1.6] text-text-tertiary">
              {event.body}
            </p>
          )
        )}
      </div>
    </div>
  );
}
