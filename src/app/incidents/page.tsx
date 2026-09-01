'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { SegmentedTabs } from '@/components/design/SegmentedTabs';
import { StateBlock } from '@/components/design/StateBlock';
import { describeDeadline, DEADLINE_COLOR } from '@/lib/deadline';
import { CATEGORY_LABELS, INCIDENT_TYPE_LABELS } from '@/types';

interface Action {
  id: string;
  actionType: string;
  description: string | null;
  status: string;
  dueDate: string | null;
}

interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string | null;
  incidentType: string | null;
  createdAt: string;
  reporter?: { name: string } | null;
  complianceActions: Action[];
  _count?: { complianceActions: number };
}

const SEGMENTS = [
  { value: 'pending', label: 'Needs action' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

/**
 * One list, four segments. (design 1f)
 *
 * Sorted by soonest deadline rather than most recently filed: the ordering
 * question an administrator has is "what needs me first", not "what arrived
 * last".
 */
function IncidentsPageContent() {
  const searchParams = useSearchParams();
  const segment = searchParams.get('segment') ?? 'open';

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (segment === 'pending') params.append('hasPendingActions', 'true');
      else if (segment !== 'all') params.append('status', segment);

      const response = await fetch(`/api/incidents?${params}`);
      if (!response.ok) throw new Error('Could not load incidents.');
      const data = await response.json();
      setIncidents(data.incidents ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [segment]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const nextDue = (incident: Incident) => {
      const open = incident.complianceActions
        .filter(a => a.status !== 'completed' && a.dueDate)
        .map(a => new Date(a.dueDate!).getTime())
        .sort((a, b) => a - b);
      return open[0] ?? null;
    };

    const filtered = query.trim()
      ? incidents.filter(i =>
          `${i.title} ${i.description ?? ''} ${i.incidentType ?? ''}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        )
      : incidents;

    // Soonest deadline first; incidents with none fall to the bottom.
    return [...filtered].sort((a, b) => {
      const da = nextDue(a);
      const db = nextDue(b);
      if (da === null && db === null) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [incidents, query]);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-[40px] leading-[1.15] tracking-[-0.03em] text-text">
            Incidents
          </h1>
          <span className="tabular text-[13px] text-text-muted">{incidents.length} shown</span>
          <Link
            href="/chat"
            className="ml-auto inline-flex min-h-[44px] items-center rounded-[12px] bg-text px-4 text-[14px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Report an incident
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs basePath="/incidents" active={segment} segments={SEGMENTS} />
          <label className="sr-only" htmlFor="incident-search">
            Search incidents
          </label>
          <input
            id="incident-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search descriptions, policies…"
            className="min-h-[44px] min-w-[240px] flex-1 rounded-[12px] border border-line bg-input px-3 text-[14px] text-text outline-none transition-colors focus:border-line-strong"
          />
        </div>

        <span className="eyebrow">Sorted by soonest deadline</span>

        {loading && <StateBlock variant="loading" title="Loading incidents" />}
        {error && !loading && (
          <StateBlock variant="error" title="Could not load incidents" body={error} />
        )}

        {!loading && !error && rows.length === 0 && (
          <StateBlock
            title="Nothing here"
            body={
              query.trim()
                ? 'No incident matches that search.'
                : 'Incidents appear here once they are reported through chat.'
            }
          />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
            {rows.map(incident => (
              <IncidentRow key={incident.id} incident={incident} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const openActions = incident.complianceActions.filter(a => a.status !== 'completed');
  const total = incident._count?.complianceActions ?? openActions.length;
  const done = Math.max(0, total - openActions.length);

  const next = openActions
    .filter(a => a.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];

  const deadline = next
    ? describeDeadline(next.dueDate, next.status)
    : { state: 'pending' as const, label: '—', absolute: '' };

  const category = incident.incidentType
    ? (INCIDENT_TYPE_LABELS[incident.incidentType as keyof typeof INCIDENT_TYPE_LABELS] ??
       CATEGORY_LABELS[incident.incidentType] ??
       incident.incidentType)
    : 'Unclassified';

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="flex flex-col gap-3 border-b border-input px-5 py-4 transition-colors last:border-b-0 hover:bg-input/40 sm:flex-row sm:items-center sm:gap-5"
    >
      <div className="flex w-[110px] flex-none flex-col gap-0.5">
        <span className={`tabular text-[14px] font-medium leading-none ${DEADLINE_COLOR[deadline.state]}`}>
          {deadline.label}
        </span>
        {next?.description && (
          <span className="truncate text-[11px] text-text-muted">{next.description}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium text-text">{incident.title}</span>
        <span className="text-[12px] text-text-muted">
          filed {new Date(incident.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
          {incident.reporter?.name ? ` · ${incident.reporter.name}` : ''}
        </span>
      </div>

      <span className="flex-none text-[13px] text-text-tertiary sm:w-[150px]">{category}</span>

      <span className="tabular flex-none text-[13px] text-text-tertiary sm:w-[80px]">
        {done} of {total}
      </span>

      <span
        className={`flex-none rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] sm:w-[86px] sm:text-center ${
          incident.status === 'closed'
            ? 'border-line text-text-muted'
            : 'border-line-strong text-text-secondary'
        }`}
      >
        {incident.status}
      </span>
    </Link>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense>
      <IncidentsPageContent />
    </Suspense>
  );
}
