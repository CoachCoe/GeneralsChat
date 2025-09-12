'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav style={{
      backgroundColor: 'transparent',
      padding: '0 1rem',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      width: '100%'
    }}>
      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '4rem',
        padding: '0 1rem'
      }}>
        {/* Logo/Brand - Clickable to home */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
          <div style={{
            width: '2.5rem',
            height: '2.5rem',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white',
            padding: '0.25rem'
          }}>
            <img 
              src="/sau24-logo.svg" 
              alt="SAU 24 Logo" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
          <span style={{
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            Generals Chat
          </span>
        </Link>

        {/* Admin Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsAdminOpen(!isAdminOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.color = 'white';
              e.target.style.backgroundColor = '#374151';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = '#9ca3af';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            <Settings size={20} />
          </button>

          {/* Admin Dropdown Menu */}
          {isAdminOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              minWidth: '12rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              zIndex: 10
            }}>
              <Link
                href="/admin/policies"
                style={{
                  display: 'block',
                  padding: '0.75rem 1rem',
                  color: '#9ca3af',
                  textDecoration: 'none',
                  borderBottom: '1px solid #374151',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = 'white';
                  e.target.style.backgroundColor = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#9ca3af';
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Policies
              </Link>
              <Link
                href="/admin/prompt"
                style={{
                  display: 'block',
                  padding: '0.75rem 1rem',
                  color: '#9ca3af',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = 'white';
                  e.target.style.backgroundColor = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#9ca3af';
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Prompt
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            display: 'none',
            padding: '0.5rem'
          }}
          onMouseEnter={(e) => e.target.style.color = 'white'}
          onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div style={{
          backgroundColor: '#1f2937',
          borderTop: '1px solid #374151',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Link 
              href="/admin/policies" 
              style={{ 
                color: '#9ca3af', 
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.color = 'white';
                e.target.style.backgroundColor = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#9ca3af';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <Settings size={16} />
              Policies
            </Link>

            <Link 
              href="/admin/prompt" 
              style={{ 
                color: '#9ca3af', 
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.color = 'white';
                e.target.style.backgroundColor = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#9ca3af';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <Settings size={16} />
              Prompt
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
