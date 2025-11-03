'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Toast Provider Component
 *
 * Provides toast notifications throughout the application
 * using react-hot-toast
 */
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        // Default options
        duration: 4000,
        style: {
          background: '#1f2937', // gray-800
          color: '#f9fafb', // gray-50
          border: '1px solid #374151', // gray-700
          borderRadius: '0.75rem',
          padding: '1rem',
        },
        // Success toast
        success: {
          iconTheme: {
            primary: '#10b981', // green-500
            secondary: '#f9fafb',
          },
          style: {
            border: '1px solid rgba(16, 185, 129, 0.3)',
          },
        },
        // Error toast
        error: {
          duration: 5000,
          iconTheme: {
            primary: '#ef4444', // red-500
            secondary: '#f9fafb',
          },
          style: {
            border: '1px solid rgba(239, 68, 68, 0.3)',
          },
        },
        // Loading toast
        loading: {
          iconTheme: {
            primary: '#3b82f6', // blue-500
            secondary: '#f9fafb',
          },
          style: {
            border: '1px solid rgba(59, 130, 246, 0.3)',
          },
        },
      }}
    />
  );
}
