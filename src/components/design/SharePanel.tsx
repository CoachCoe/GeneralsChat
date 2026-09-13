'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { INVITATION_TTL_DAYS } from '@/lib/invitation';

/**
 * Who else can read this incident.
 *
 * A share grants reading and nothing else, and the panel says so rather than
 * leaving a recipient to discover it by pressing a control that refuses.
 *
 * No colour. Colour here means a deadline state or a coverage gap; who can see
 * a record is neither.
 */
interface Share {
  id: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface PendingInvitation {
  id: string;
  email: string;
  expiresAt: string;
}

/** Shown once, for the sharer to pass on. */
interface IssuedLink {
  email: string;
  link: string;
}

const controlStyle = {
  minHeight: '36px',
  padding: '0 12px',
  borderRadius: '8px',
  border: '1px solid var(--color-line-strong)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontSize: '13px',
  cursor: 'pointer',
} as const;

export function SharePanel({ incidentId }: { incidentId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [canShare, setCanShare] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/incidents/${incidentId}/shares`);
    if (!response.ok) return;
    const body = await response.json();
    setShares(body.shares);
    setInvitations(body.invitations);
    setCanShare(body.canShare);
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  const share = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? 'Could not share this incident');
        return;
      }
      if (body.link) {
        setIssued({ email: body.invitation.email, link: body.link });
      } else {
        toast.success(`Shared with ${body.share.user.name}`);
      }
      setEmail('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async (share: Share) => {
    const response = await fetch(`/api/incidents/${incidentId}/shares/${share.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      toast.error('Could not stop sharing');
      return;
    }
    toast.success(`${share.user.name} can no longer read this`);
    await load();
  };

  return (
    <section
      data-testid="share-panel"
      className="flex flex-col gap-3 rounded-[16px] border p-5"
      style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
    >
      <span className="eyebrow">Shared with</span>

      {shares.length === 0 && invitations.length === 0 && (
        <p className="text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
          Only you and district staff can read this.
        </p>
      )}

      {shares.map(share => (
        <div
          key={share.id}
          data-testid="share-row"
          className="flex flex-wrap items-center gap-3"
        >
          <span className="flex-1 text-[14px]" style={{ color: 'var(--color-text)' }}>
            {share.user.name}
            <span
              className="ml-2 text-[13px]"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
            >
              {share.user.email}
            </span>
          </span>
          {canShare && (
            <button type="button" style={controlStyle} onClick={() => stopSharing(share)}>
              Stop sharing
            </button>
          )}
        </div>
      ))}

      {invitations.map(invitation => (
        <div key={invitation.id} data-testid="share-row" className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{invitation.email}</span>
            <span className="eyebrow ml-3">Invited</span>
          </span>
        </div>
      ))}

      {canShare && (
        <form onSubmit={share} className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="colleague@district.org"
            data-testid="share-email"
            className="min-h-[36px] flex-1 rounded-[8px] border px-3 text-[14px]"
            style={{
              borderColor: 'var(--color-line)',
              background: 'var(--color-input)',
              color: 'var(--color-text)',
              minWidth: '200px',
            }}
          />
          <button type="submit" disabled={busy || !email.trim()} style={controlStyle}>
            Share
          </button>
        </form>
      )}

      {canShare && (
        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          They will be able to read this incident and its documents. Only you can change it,
          mark obligations done, or share it further.
        </p>
      )}

      {issued && (
        <div
          data-testid="invite-link"
          role="status"
          className="flex flex-col gap-2 rounded-[12px] border p-4"
          style={{ borderColor: 'var(--color-line-strong)' }}
        >
          <span className="eyebrow">Send this to {issued.email}</span>
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
            They have no account yet. This link creates one for that address — anyone who
            holds it can use it, so send it to them directly. It works once and expires in{' '}
            {INVITATION_TTL_DAYS} days.
          </p>
          <code
            className="select-all break-all rounded-[8px] px-3 py-2 text-[13px]"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-input)',
              color: 'var(--color-text)',
            }}
          >
            {issued.link}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              style={controlStyle}
              onClick={() => {
                navigator.clipboard?.writeText(issued.link);
                toast.success('Link copied');
              }}
            >
              Copy link
            </button>
            <button type="button" style={controlStyle} onClick={() => setIssued(null)}>
              I have sent it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
