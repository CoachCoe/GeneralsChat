'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

/**
 * Error UI for route-level errors
 *
 * This catches errors at the route level (not React component errors)
 * such as server errors, data fetching errors, etc.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console and any error tracking service
    console.error('Route error:', error);

  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-surface border border-line rounded-xl p-8 shadow-xl">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-surface rounded-full">
              <AlertCircle className="h-16 w-16 text-text-tertiary" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-text text-center mb-4">
            Something went wrong
          </h1>

          {/* Description */}
          <p className="text-text-muted text-center mb-6">
            We encountered an unexpected error while loading this page.
            You can try refreshing the page or return to the home page.
          </p>

          {/* Error Details (in development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-4 bg-surface rounded-lg border border-line">
              <h3 className="text-sm font-semibold text-text-secondary mb-2">Error Details (Development Only):</h3>
              <pre className="text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap break-words">
                {error.message}
              </pre>
              {error.digest && (
                <p className="text-xs text-text-muted mt-2">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={reset}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="flex items-center gap-2 border-line-strong text-text-secondary hover:bg-surface"
            >
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
