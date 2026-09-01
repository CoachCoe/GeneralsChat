'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { StateBlock } from '@/components/design/StateBlock';
import { SegmentedTabs } from '@/components/design/SegmentedTabs';
import { AuthorityChip } from '@/components/design/AuthorityChip';
import {
  CATEGORY_LABELS,
  POLICY_JURISDICTIONS,
  JURISDICTION_LABELS,
} from '@/types';
import { useMounted } from '@/lib/useMounted';

interface Policy {
  id: string;
  title: string;
  jurisdiction: string;
  category: string;
  effectiveDate: string;
  isActive: boolean;
}

/**
 * The policy library, read-only.
 *
 * The design proposed removing this route and giving /admin/policies a
 * read-only view for non-admins. That would mean loosening the /admin/*
 * middleware gate, which is a security regression for a routing preference --
 * so the two surfaces are kept instead: this is the library anyone signed in
 * can read, and /admin/policies stays admin-only for management. The duplicate
 * upload control that used to live here is gone, which was the actual
 * duplication worth removing.
 *
 * Guidance quality depends entirely on what is loaded here, and early on the
 * library is sparse -- so the empty and thin states are the common case, not
 * an edge case.
 */
export default function PoliciesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState('all');
  const mounted = useMounted();

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/policies?active=true');
        if (!response.ok) throw new Error('Could not load the policy library.');
        const data = await response.json();
        setPolicies(data.policies ?? []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = useMemo(
    () =>
      jurisdiction === 'all'
        ? policies
        : policies.filter(p => p.jurisdiction === jurisdiction),
    [policies, jurisdiction]
  );

  const localCount = policies.filter(
    p => p.jurisdiction === 'district' || p.jurisdiction === 'school'
  ).length;

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto flex max-w-[900px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-[40px] leading-[1.15] tracking-[-0.03em] text-text">
            Policy library
          </h1>
          <span className="tabular text-[13px] text-text-muted">{policies.length} active</span>
          {isAdmin && (
            <Link
              href="/admin/policies"
              className="ml-auto inline-flex min-h-[44px] items-center rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text"
            >
              Manage policies
            </Link>
          )}
        </div>

        {!loading && !error && policies.length > 0 && localCount < 3 && (
          <div className="rounded-[16px] border border-attention/40 bg-attention/[0.07] px-5 py-4 text-[14px] leading-[1.6] text-text-secondary">
            <span className="font-medium text-text">
              {localCount === 0
                ? 'No district or school policies are loaded.'
                : `Only ${localCount} district or school ${localCount === 1 ? 'policy is' : 'policies are'} loaded.`}
            </span>{' '}
            Guidance will lean on state and federal law until more are added, and there will be
            more coverage gaps than there should be. Deadlines shown on obligations are not yet
            derived from the cited policy — confirm each one before acting on it.
          </div>
        )}

        <SegmentedTabs
          basePath="/policies"
          onSelect={setJurisdiction}
          active={jurisdiction}
          segments={[
            { value: 'all', label: 'All' },
            ...POLICY_JURISDICTIONS.map(j => ({
              value: j,
              label: JURISDICTION_LABELS[j],
              count: policies.filter(p => p.jurisdiction === j).length,
            })),
          ]}
        />

        {loading && <StateBlock variant="loading" title="Loading the policy library" />}
        {error && !loading && (
          <StateBlock variant="error" title="Could not load the policy library" body={error} />
        )}

        {!loading && !error && shown.length === 0 && (
          <StateBlock
            title={policies.length === 0 ? 'No policies loaded' : 'Nothing at this level'}
            body={
              policies.length === 0
                ? 'Guidance rests on the policies loaded here. Until some are added it can only cite state and federal law.'
                : 'No policy has been loaded for this jurisdiction yet.'
            }
          />
        )}

        {!loading && !error && shown.length > 0 && (
          <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
            {shown.map(policy => (
              <div
                key={policy.id}
                className="flex flex-wrap items-center gap-3 border-b border-input px-5 py-4 last:border-b-0"
              >
                <AuthorityChip jurisdiction={policy.jurisdiction} />
                <span className="min-w-0 flex-1 truncate text-[15px] text-text">{policy.title}</span>
                <span className="text-[13px] text-text-tertiary">
                  {CATEGORY_LABELS[policy.category] ?? policy.category}
                </span>
                <span className="tabular text-[12px] text-text-muted">
                  {mounted
                    ? new Date(policy.effectiveDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                      })
                    : '\u00a0'}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
