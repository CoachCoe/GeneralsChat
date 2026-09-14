'use client';

import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 *
 * Catches React errors and displays a fallback UI
 * instead of crashing the entire application
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console and any error tracking service
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
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
                We encountered an unexpected error. This has been logged and we&apos;ll look into it.
                You can try refreshing the page or return to the home page.
              </p>

              {/* Error Details (in development) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 p-4 bg-surface rounded-lg border border-line">
                  <h3 className="text-sm font-semibold text-text-secondary mb-2">Error Details (Development Only):</h3>
                  <pre className="text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap break-words">
                    {this.state.error.toString()}
                  </pre>
                  {this.state.errorInfo && (
                    <details className="mt-3">
                      <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
                        Component Stack
                      </summary>
                      <pre className="text-xs text-text-muted mt-2 overflow-x-auto whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={this.handleReset}
                  className="btn-primary flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
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

    return this.props.children;
  }
}
