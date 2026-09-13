'use client';

import { useCallback, useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import { useMounted } from '@/lib/useMounted';

/**
 * Who can sign in, and who no longer can.
 *
 * One role is offered. Administrators and investigators exist and are made with
 * `scripts/create-user.ts`; a screen that can mint an admin is a screen where a
 * misclick grants the district's whole incident record.
 *
 * Revoking is not deleting, and the page says so: the incidents someone filed
 * and the record of what they read stay attributed to them. That is the point
 * of an audit log.
 */
interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  deactivatedAt: string | null;
  createdAt: string;
  _count: { reportedIncidents: number };
}

/** A password is shown once, and only to the administrator who made it. */
interface NewCredentials {
  email: string;
  password: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<NewCredentials | null>(null);
  const mounted = useMounted();

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/users');
    if (response.ok) setUsers((await response.json()).users);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body?.error ?? 'Could not create that user');
        return;
      }
      setCredentials({ email: body.user.email, password: body.password });
      setName('');
      setEmail('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (user: ManagedUser, active: boolean) => {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.error ?? 'Could not update that user');
      return;
    }
    toast.success(active ? `${user.name} can sign in again` : `${user.name} can no longer sign in`);
    await load();
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="heading-xl mb-2" style={{ color: 'var(--color-text)' }}>
          People
        </h1>
        <p className="body-text mb-8" style={{ color: 'var(--color-text-secondary)' }}>
          Everyone who can sign in. Revoking ends access without deleting anything: the
          incidents someone filed, and the record of what they read, stay attributed to them.
        </p>

        <form
          onSubmit={create}
          className="mb-8 flex flex-col gap-3 rounded-[16px] border p-5 sm:flex-row sm:items-end"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
        >
          <label className="flex flex-1 flex-col gap-2">
            <span className="eyebrow">Name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Rivera"
              data-testid="user-name"
              className="min-h-[44px] rounded-[10px] border px-3 text-[15px]"
              style={{
                borderColor: 'var(--color-line)',
                background: 'var(--color-input)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <label className="flex flex-1 flex-col gap-2">
            <span className="eyebrow">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@district.org"
              data-testid="user-email"
              className="min-h-[44px] rounded-[10px] border px-3 text-[15px]"
              style={{
                borderColor: 'var(--color-line)',
                background: 'var(--color-input)',
                color: 'var(--color-text)',
              }}
            />
          </label>
          <button
            type="submit"
            disabled={saving || !name.trim() || !email.trim()}
            className="min-h-[44px] rounded-[10px] border px-4 text-[14px] disabled:opacity-50"
            style={{
              borderColor: 'var(--color-line-strong)',
              color: 'var(--color-text)',
              background: 'transparent',
            }}
          >
            Add reporter
          </button>
        </form>

        {credentials && (
          <div
            data-testid="new-credentials"
            role="status"
            className="mb-8 flex flex-col gap-2 rounded-[16px] border p-5"
            style={{ borderColor: 'var(--color-line-strong)', background: 'var(--color-surface)' }}
          >
            <span className="eyebrow">Shown once</span>
            <p className="body-text" style={{ color: 'var(--color-text)' }}>
              Give {credentials.email} this password. It is not stored anywhere you can read
              it again, and leaving this page loses it.
            </p>
            <code
              className="select-all rounded-[8px] px-3 py-2 text-[15px]"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--color-input)',
                color: 'var(--color-text)',
              }}
            >
              {credentials.password}
            </code>
            <button
              type="button"
              onClick={() => setCredentials(null)}
              className="self-start text-[13px] underline"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              I have sent it
            </button>
          </div>
        )}

        {loading ? (
          <p className="body-text" style={{ color: 'var(--color-text-muted)' }}>
            Loading…
          </p>
        ) : (
          <div
            className="flex flex-col overflow-hidden rounded-[16px] border"
            style={{ borderColor: 'var(--color-line)' }}
          >
            {users.map((user, index) => (
              <div
                key={user.id}
                data-testid="user-row"
                className="flex flex-wrap items-center gap-3 px-5 py-4"
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid var(--color-line)',
                  background: 'var(--color-surface)',
                  opacity: user.deactivatedAt ? 0.6 : 1,
                }}
              >
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className="text-[15px]" style={{ color: 'var(--color-text)' }}>
                    {user.name}
                    {user.deactivatedAt && (
                      <span className="eyebrow ml-3" style={{ color: 'var(--color-text-muted)' }}>
                        Revoked
                      </span>
                    )}
                  </span>
                  <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {user.email} · {user.role}
                  </span>
                </div>
                <span
                  className="text-[13px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
                >
                  {user._count.reportedIncidents} filed
                </span>
                {/* Rendered after mount: a joined date formats differently on
                    the server and in the reader's timezone. */}
                <span
                  className="w-[110px] text-[13px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
                >
                  {mounted ? new Date(user.createdAt).toLocaleDateString() : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setActive(user, Boolean(user.deactivatedAt))}
                  className="min-h-[36px] rounded-[8px] border px-3 text-[13px]"
                  style={{
                    borderColor: 'var(--color-line-strong)',
                    color: 'var(--color-text)',
                    background: 'transparent',
                  }}
                >
                  {user.deactivatedAt ? 'Restore' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
