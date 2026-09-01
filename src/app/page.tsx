'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ObligationRow, type Obligation } from '@/components/design/ObligationRow';
import { StateBlock } from '@/components/design/StateBlock';
import { useMounted } from '@/lib/useMounted';

interface Counts {
  overdue: number;
  today: number;
  week: number;
  open: number;
}

/**
 * Home is the obligation queue. (design 1a)
 *
 * The homepage used to be three navigation cards. An administrator opens this
 * app to find out what they are late on, and nothing on screen answered that --
 * while the data to answer it was being written on every classified incident
 * and never read back.
 */
export default function HomePage() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useMounted();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/obligations');
      if (!response.ok) throw new Error('Could not load your obligations.');
      const data = await response.json();
      setObligations(data.obligations);
      setCounts(data.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markDone = async (id: string) => {
    const response = await fetch(`/api/obligations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    if (response.ok) await load();
  };

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = (o: Obligation) => (o.dueDate ? new Date(o.dueDate).getTime() : null);
  const open = obligations.filter(o => o.status !== 'completed');

  const overdue = open.filter(o => due(o) !== null && due(o)! < now);
  const today = open.filter(
    o => due(o) !== null && due(o)! >= now && due(o)! <= endOfToday.getTime()
  );
  const later = open.filter(o => due(o) === null || due(o)! > endOfToday.getTime());

  // The headline is the finding, not a page title.
  const headline =
    overdue.length > 0
      ? `${overdue.length === 1 ? 'One thing is' : `${overdue.length} things are`} late.`
      : today.length > 0
        ? `Nothing is late.`
        : `You're clear.`;

  const subhead =
    today.length > 0
      ? `${today.length === 1 ? 'One more is' : `${today.length} more are`} due today.`
      : overdue.length > 0
        ? 'Nothing else is due today.'
        : 'No obligations are outstanding.';

  const stamp = new Date().toLocaleString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto flex max-w-[900px] flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <span className="eyebrow">{mounted ? stamp : '\u00a0'}</span>
          <h1 className="font-display text-[40px] leading-[1.15] tracking-[-0.03em] text-text">
            {headline}
          </h1>
          <p className="font-display text-[40px] leading-[1.15] tracking-[-0.03em] text-text-tertiary">
            {subhead}
          </p>
        </header>

        {counts && (
          <div className="flex flex-wrap gap-3">
            <Tally n={counts.overdue} label="Overdue" tone="text-overdue" />
            <Tally n={counts.today} label="Due today" tone="text-attention" />
            <Tally n={counts.week} label="This week" tone="text-text-secondary" />
          </div>
        )}

        <Link
          href="/chat"
          className="inline-flex min-h-[44px] w-fit items-center rounded-[12px] bg-text px-4 text-[14px] font-medium text-bg transition-opacity hover:opacity-90"
        >
          Report an incident
        </Link>

        {loading && <StateBlock variant="loading" title="Loading your obligations" />}

        {error && !loading && (
          <StateBlock variant="error" title="Could not load your obligations" body={error} />
        )}

        {!loading && !error && open.length === 0 && (
          <StateBlock
            title="Nothing outstanding"
            body="Obligations appear here as soon as an incident is classified, with the deadline the policy sets."
          />
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-6" data-testid="obligation-queue">
            <Group title="Overdue" tone="text-overdue" items={overdue} onDone={markDone} />
            <Group title="Due today" tone="text-attention" items={today} onDone={markDone} />
            <Group title="Later" tone="text-text-muted" items={later} onDone={markDone} />
          </div>
        )}
      </main>
    </div>
  );
}

function Tally({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-[12px] border border-line bg-surface px-4 py-3">
      <span className={`tabular text-[22px] font-medium leading-none ${tone}`}>{n}</span>
      <span className="text-[13px] text-text-tertiary">{label}</span>
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  onDone,
}: {
  title: string;
  tone: string;
  items: Obligation[];
  onDone: (id: string) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <span className={`eyebrow ${tone}`}>{title}</span>
      <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
        {items.map(o => (
          <ObligationRow key={o.id} obligation={o} onDone={onDone} showIncident />
        ))}
      </div>
    </section>
  );
}
