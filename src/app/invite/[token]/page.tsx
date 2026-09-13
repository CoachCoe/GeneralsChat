'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { INVITATION_TTL_DAYS } from '@/lib/invitation';

/**
 * Claiming an invitation.
 *
 * The only page in the application reachable without a session, apart from
 * signing in. It shows the address it was issued to and nothing else: not the
 * incident's title, not who invited them, not that an incident is involved. A
 * link that reached the wrong inbox must not disclose that a child's incident
 * exists.
 *
 * A used, expired, revoked or invented link all look the same here, for the
 * same reason.
 */
type State =
  | { status: 'checking' }
  | { status: 'invalid' }
  | { status: 'ready'; email: string }
  | { status: 'done'; email: string; alreadyRegistered: boolean };

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<State>({ status: 'checking' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then(async response => {
        if (!response.ok) return setState({ status: 'invalid' });
        const { email } = await response.json();
        setState({ status: 'ready', email });
      })
      .catch(() => setState({ status: 'invalid' }));
  }, [token]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'This invitation is no longer valid.'
            : (body?.error ?? 'Could not accept this invitation.')
        );
        return;
      }
      setState({
        status: 'done',
        email: body.email,
        alreadyRegistered: Boolean(body.alreadyRegistered),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-12"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-[16px] border p-7"
        style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
      >
        <span className="eyebrow">Invitation</span>

        {state.status === 'checking' && (
          <p className="body-text" style={{ color: 'var(--color-text-muted)' }}>
            Checking this link…
          </p>
        )}

        {state.status === 'invalid' && (
          <>
            <h1
              className="font-display text-[26px] leading-[1.2]"
              style={{ color: 'var(--color-text)' }}
            >
              This link is no longer valid
            </h1>
            <p className="body-text" style={{ color: 'var(--color-text-secondary)' }}>
              Invitations can be used once and expire after {INVITATION_TTL_DAYS} days. Ask
              whoever sent it to share the incident again.
            </p>
          </>
        )}

        {state.status === 'ready' && (
          <>
            <h1
              className="font-display text-[26px] leading-[1.2]"
              style={{ color: 'var(--color-text)' }}
            >
              Set up your account
            </h1>
            <p className="body-text" style={{ color: 'var(--color-text-secondary)' }}>
              This invitation is for{' '}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {state.email}
              </span>
              . If that is not you, close this page.
            </p>

            <form onSubmit={accept} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Your name</span>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  data-testid="invite-name"
                  className="min-h-[44px] rounded-[10px] border px-3 text-[15px]"
                  style={{
                    borderColor: 'var(--color-line)',
                    background: 'var(--color-input)',
                    color: 'var(--color-text)',
                  }}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Choose a password</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  data-testid="invite-password"
                  className="min-h-[44px] rounded-[10px] border px-3 text-[15px]"
                  style={{
                    borderColor: 'var(--color-line)',
                    background: 'var(--color-input)',
                    color: 'var(--color-text)',
                  }}
                />
                <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                  At least {MIN_PASSWORD_LENGTH} characters.
                </span>
              </label>

              {error && (
                <p role="alert" className="text-[14px]" style={{ color: 'var(--color-text)' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                data-testid="invite-accept"
                className="min-h-[44px] rounded-[10px] border text-[15px] disabled:opacity-50"
                style={{
                  borderColor: 'var(--color-line-strong)',
                  color: 'var(--color-text)',
                  background: 'transparent',
                }}
              >
                Create account
              </button>
            </form>
          </>
        )}

        {state.status === 'done' && (
          <>
            <h1
              className="font-display text-[26px] leading-[1.2]"
              style={{ color: 'var(--color-text)' }}
            >
              {state.alreadyRegistered ? 'You already have an account' : 'Account created'}
            </h1>
            <p className="body-text" style={{ color: 'var(--color-text-secondary)' }}>
              {state.alreadyRegistered
                ? `${state.email} already had an account, so sign in with the password you were given. The incident is now shared with you.`
                : `Sign in as ${state.email} to open what was shared with you.`}
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="min-h-[44px] rounded-[10px] border text-[15px]"
              style={{
                borderColor: 'var(--color-line-strong)',
                color: 'var(--color-text)',
                background: 'transparent',
              }}
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
