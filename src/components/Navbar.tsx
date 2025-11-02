'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
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
    <nav className={`navbar-apple sticky top-0 z-50 w-full safe-area-inset-top ${isScrolled ? 'scrolled' : ''}`}>
      <div className="w-full flex items-center justify-between h-[52px] px-4 max-w-[1440px] mx-auto">
        {/* Logo/Brand - Clickable to home */}
        <Link href="/" className="navbar-link" style={{ fontWeight: 600, color: 'var(--foreground)' }}>
          Home
        </Link>

        {/* Right side navigation */}
        <div className="flex items-center gap-2">
          {/* Policies Link */}
          <Link href="/admin/policies" className="navbar-link">
            Policies
          </Link>

          {/* Prompt Link */}
          <Link href="/admin/prompt" className="navbar-link">
            Prompt
          </Link>

          {/* Incidents Link */}
          <Link href="/incidents" className="navbar-link">
            Incidents
          </Link>

          {/* Settings Menu */}
          <div className="relative">
            <span
              onClick={() => setIsAdminOpen(!isAdminOpen)}
              className="navbar-link"
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
                <div className="navbar-dropdown z-50">
                  <Link
                    href="/about"
                    onClick={() => setIsAdminOpen(false)}
                    className="navbar-dropdown-item"
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
          padding: '8px'
        }}>
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/policies"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
            >
              Policies
            </Link>

            <Link
              href="/admin/prompt"
              onClick={() => setIsMobileMenuOpen(false)}
              className="navbar-dropdown-item"
            >
              Prompt
            </Link>

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
