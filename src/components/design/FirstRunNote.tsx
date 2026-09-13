'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { describeLibraryScope } from '@/lib/library-scope';

/**
 * What an administrator needs to know before their first question.
 *
 * In the empty state rather than a modal on first load. A modal appears before
 * anyone has a question, so it is dismissed rather than read, and it is shown
 * once -- to the person who set the system up, not to the substitute principal
 * opening it at four o'clock in November. This is on screen at the moment it is
 * relevant, for every person and every new incident, and it costs a scroll to
 * pass.
 *
 * Three things, because these are the ones that cause harm when they are not
 * understood: what not to type, what the guidance rests on, and what the
 * documents are.
 *
 * No colour. A coverage gap for a specific incident is an amber signal; this is
 * an orientation, and painting it would spend the one thing this interface
 * raises its voice with on something nobody has to act on.
 *
 * The scope sentence is absent until the server answers, rather than standing
 * in for it. A placeholder saying something else -- however true -- is a claim
 * the reader watches get replaced by a different claim.
 */
export function FirstRunNote() {
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/library/scope')
      .then(response => (response.ok ? response.json() : null))
      .then(body => {
        if (body) setScope(describeLibraryScope(body.categories));
      })
      .catch(() => {});
  }, []);

  return (
    <div
      data-testid="first-run-note"
      className="flex w-full max-w-[560px] flex-col gap-4 rounded-[16px] border p-6 text-left"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      <span className="eyebrow">Before you start</span>

      <div className="flex flex-col gap-3">
        <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text)' }}>Leave names out.</span> Describe people by
          their role — the reported student, the parent, the staff member. What you type is kept
          as part of the incident record.
        </p>
        <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text)' }}>Answers rest on loaded policy.</span>{' '}
          Beside every answer is what it was drawn from, down to the provision.
          {scope ? ` ${scope}` : ''}
        </p>
        <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-text)' }}>What it produces are drafts.</span> The
          report and the summary are prepared from the record for you to check, complete and
          file. The system does not sign anything.
        </p>
      </div>

      <Link
        href="/about"
        className="text-[13px] underline underline-offset-2"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        How this works
      </Link>
    </div>
  );
}
