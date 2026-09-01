'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error) {
      // Deliberately generic: do not reveal whether the account exists.
      setError('Incorrect email or password.');
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/General.jpeg"
            alt=""
            width={72}
            height={72}
            className="rounded-full mb-4"
          />
          <h1 className="font-display text-[32px] leading-[1.15] tracking-[-0.03em] text-text">
            Compliance, on the clock.
          </h1>
          <p className="mt-2 text-[15px] leading-[1.6] text-text-tertiary">
            Sign in to see what&apos;s outstanding.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] text-text-tertiary">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[44px] w-full rounded-[12px] border border-line bg-input px-3 py-2.5 text-[15px] text-text outline-none transition-colors focus:border-line-strong"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] text-text-tertiary">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[44px] w-full rounded-[12px] border border-line bg-input px-3 py-2.5 text-[15px] text-text outline-none transition-colors focus:border-line-strong"
            />
          </div>

          {error && (
            <p role="alert" className="text-[14px] text-overdue">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] w-full rounded-[12px] bg-text px-4 text-[15px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-center text-[12px] leading-[1.6] text-text-muted">
          Student records. Sessions end after 30 minutes idle.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
