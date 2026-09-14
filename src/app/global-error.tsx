'use client';

import { useEffect } from 'react';

/**
 * Global Error UI
 *
 * This catches errors at the root level, including errors in the root layout.
 * Note: This file must define its own <html> and <body> tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console and any error tracking service
    console.error('Global error:', error);

  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'system-ui, sans-serif',
          /*
           * This file replaces the root layout, so it cannot import
           * `theme.css`. The values are the dark palette's tokens copied here
           * rather than a second palette invented here -- keep them in step
           * with the `@theme` block in `src/app/theme.css`.
           *
           * There is no red and no green. Colour in this interface means a
           * deadline state or a coverage gap; an error is neither, and the
           * "Try Again" button was painted the same green that means an
           * obligation was discharged.
           */
          ['--gc-bg' as string]: '#0f0f0f',
          ['--gc-surface' as string]: '#1c1917',
          ['--gc-line' as string]: '#44403c',
          ['--gc-text' as string]: '#fafaf9',
          ['--gc-text-secondary' as string]: '#d6d3d1',
          ['--gc-text-muted' as string]: '#78716c',
          ['--gc-text-tertiary' as string]: '#a8a29e',
        }}
      >
        <div style={{
          minHeight: '100vh',
          backgroundColor: 'var(--gc-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            maxWidth: '32rem',
            width: '100%',
            backgroundColor: 'var(--gc-surface)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '0.75rem',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}>
            {/* Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '1.5rem',
            }}>
              <div style={{
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '9999px',
              }}>
                <svg
                  width="64"
                  height="64"
                  fill="none"
                  stroke="var(--gc-text-tertiary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="32" cy="32" r="28" />
                  <line x1="32" y1="20" x2="32" y2="32" />
                  <line x1="32" y1="40" x2="32.01" y2="40" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: 'white',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              Application Error
            </h1>

            {/* Description */}
            <p style={{
              color: 'var(--gc-text-muted)',
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}>
              We encountered a critical error. Please try refreshing the page.
              If the problem persists, contact support.
            </p>

            {/* Error Details (in development) */}
            {process.env.NODE_ENV === 'development' && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: 'rgba(17, 24, 39, 0.5)',
                borderRadius: '0.5rem',
                border: '1px solid #374151',
              }}>
                <h3 style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#fca5a5',
                  marginBottom: '0.5rem',
                }}>
                  Error Details (Development Only):
                </h3>
                <pre style={{
                  fontSize: '0.75rem',
                  color: 'var(--gc-text-secondary)',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {error.message}
                </pre>
                {error.digest && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--gc-text-muted)',
                    marginTop: '0.5rem',
                  }}>
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              justifyContent: 'center',
            }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'var(--gc-text)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--gc-text)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--gc-text)'}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" transform="scale(0.8) translate(-3, -3)" />
                </svg>
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'transparent',
                  color: 'var(--gc-text-secondary)',
                  border: '1px solid #4b5563',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--gc-line)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" transform="scale(0.8) translate(-2, -2)" />
                  <polyline points="9 22 9 12 15 12 15 22" transform="scale(0.8) translate(-2, -2)" />
                </svg>
                Go Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
