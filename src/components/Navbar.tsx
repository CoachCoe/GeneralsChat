'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="navbar-apple sticky top-0 z-50 w-full safe-area-inset-top">
      <div className="w-full flex items-center justify-between h-[52px] px-4 max-w-[1440px] mx-auto">
        {/* Logo/Brand - Clickable to home */}
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span className="text-apple-title3" style={{ color: 'var(--foreground)' }}>
            Home
          </span>
        </Link>

        {/* Right side navigation */}
        <div className="flex items-center gap-6">
          {/* Policies Link */}
          <Link href="/admin/policies" className="flex items-center gap-3 no-underline">
            <span className="text-apple-title3" style={{
              color: 'var(--muted-foreground)',
              transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              Policies
            </span>
          </Link>

          {/* Prompt Link */}
          <Link href="/admin/prompt" className="flex items-center gap-3 no-underline">
            <span className="text-apple-title3" style={{
              color: 'var(--muted-foreground)',
              transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              Prompt
            </span>
          </Link>

          {/* Incidents Link */}
          <Link href="/incidents" className="flex items-center gap-3 no-underline">
            <span className="text-apple-title3" style={{
              color: 'var(--muted-foreground)',
              transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              Incidents
            </span>
          </Link>

          {/* Settings Menu */}
          <div className="relative">
            <span
              onClick={() => setIsAdminOpen(!isAdminOpen)}
              className="text-apple-title3"
              style={{
                color: 'var(--muted-foreground)',
                transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              Settings
            </span>

            {/* Settings Dropdown Menu */}
            {isAdminOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsAdminOpen(false)}
                />

                {/* Menu */}
                <div className="absolute top-full right-0 mt-2 z-50" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0px',
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none'
                }}>
                  <Link
                    href="/about"
                    onClick={() => setIsAdminOpen(false)}
                    className="no-underline"
                    style={{
                      padding: '6px 0px',
                      color: 'var(--muted-foreground)',
                      textDecoration: 'none',
                      fontSize: '17px',
                      transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                      background: 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                      display: 'block'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
                  >
                    About
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu Button (for future responsive support) */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="hidden transition-apple p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div style={{
          borderTop: '0.5px solid var(--separator)',
          padding: '8px 0'
        }}>
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/policies"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                color: 'var(--muted-foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              <span className="text-apple-body">Policies</span>
            </Link>

            <Link
              href="/admin/prompt"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                color: 'var(--muted-foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              <span className="text-apple-body">Prompt</span>
            </Link>

            <Link
              href="/incidents"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                color: 'var(--muted-foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              <span className="text-apple-body">Incidents</span>
            </Link>

            <Link
              href="/about"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                color: 'var(--muted-foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              <Settings size={16} className="mr-2" />
              <span className="text-apple-body">About</span>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
