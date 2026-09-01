'use client';

import { signOut, useSession } from 'next-auth/react';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Settings, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav aria-label="Main" className={`navbar sticky top-0 z-50 w-full safe-area-inset-top ${isScrolled ? 'scrolled' : ''}`}>
      <div className="w-full flex items-center justify-between h-[52px] px-4 max-w-[1440px] mx-auto">
        {/* Logo/Brand - Clickable to home */}
        <Link href="/" className="flex items-center" style={{ opacity: 0.9, transition: 'opacity 0.2s' }}>
          <Image
            src="/logo.png"
            alt="Generals Chat Logo"
            width={40}
            height={40}
            style={{ objectFit: 'contain' }}
            priority
          />
        </Link>

        {/* Right side navigation — desktop */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Chat Link */}
          <Link href="/chat" className="navbar-link">
            Chat
          </Link>

          {/* The read-only library, which any signed-in user may read. This
              pointed at /admin/policies for everyone, so a reporter clicking
              "Policies" was bounced to the home queue with no explanation and
              the library README documents was reachable only by typing the
              URL. The page itself links admins onward to /admin/policies.
              (SPEC-50) */}
          <Link href="/policies" className="navbar-link">
            Policies
          </Link>

          {isAdmin && (
            <Link href="/admin/prompt" className="navbar-link">
              Advisor
            </Link>
          )}

          {/* Incidents Link */}
          <Link href="/incidents" className="navbar-link">
            Incidents
          </Link>

          {/* Settings Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAdminOpen(!isAdminOpen)}
              aria-expanded={isAdminOpen}
              aria-haspopup="menu"
              className="navbar-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            >
              Settings
            </button>

            {/* Settings Dropdown Menu */}
            {isAdminOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsAdminOpen(false)}
                />

                {/* Menu */}
                <div className="navbar-dropdown z-50">
                  {session?.user && (
                    <div className="navbar-dropdown-item" style={{ opacity: 0.7, cursor: 'default' }}>
                      {session.user.email}
                      <br />
                      <span style={{ fontSize: '0.75rem' }}>{session.user.role}</span>
                    </div>
                  )}
                  <Link
                    href="/about"
                    onClick={() => setIsAdminOpen(false)}
                    className="navbar-dropdown-item"
                  >
                    About
                  </Link>
                  {session?.user && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdminOpen(false);
                        signOut({ callbackUrl: '/login' });
                      }}
                      className="navbar-dropdown-item"
                      style={{ width: '100%', textAlign: 'left' }}
                    >
                      Sign out
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center border-none bg-transparent p-2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] md:hidden"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div style={{
          borderTop: '0.5px solid var(--color-line)',
          padding: '8px'
        }}>
          <div className="flex flex-col gap-1">
            <Link
              href="/chat"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
            >
              Chat
            </Link>

            <Link
              href="/policies"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
            >
              Policies
            </Link>

            {isAdmin && (
              <Link
                href="/admin/prompt"
                onClick={() => setIsMobileMenuOpen(false)}
                className="navbar-dropdown-item"
              >
                Advisor
              </Link>
            )}

            <Link
              href="/incidents"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
            >
              Incidents
            </Link>

            <Link
              href="/about"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Settings size={16} />
              About
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
