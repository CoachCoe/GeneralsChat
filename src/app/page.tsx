import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle, Shield, Brain, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function Dashboard() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-apple-largetitle mb-8" style={{
            color: 'var(--foreground)',
            fontSize: '56px',
            lineHeight: '64px',
            fontWeight: 700
          }}>
            Generals Chat
          </h1>
          <p className="text-apple-title3 max-w-4xl mx-auto" style={{
            color: 'var(--muted-foreground)',
            fontWeight: 300
          }}>
            Chat with the General to navigate complex disciplinary incident compliance requirements with
            <span style={{
              color: 'var(--primary)',
              fontWeight: 600
            }}> AI-powered guidance</span>
          </p>
          <div className="mt-8 flex justify-center">
            <div style={{
              width: '96px',
              height: '4px',
              background: 'linear-gradient(to right, var(--primary), var(--info))',
              borderRadius: 'var(--radius-sm)'
            }}></div>
          </div>
        </div>

        {/* Main AI Chat Interface */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="card-apple elevation-2" style={{ padding: 'var(--spacing-8)' }}>
            <div className="text-center" style={{ paddingBottom: 'var(--spacing-6)' }}>
              <div style={{
                padding: 'var(--spacing-4)',
                borderRadius: 'var(--radius-2xl)',
                background: 'linear-gradient(135deg, rgba(48, 209, 88, 0.15) 0%, rgba(100, 210, 255, 0.15) 100%)',
                width: 'fit-content',
                margin: '0 auto var(--spacing-6)'
              }}>
                <Brain style={{
                  width: '48px',
                  height: '48px',
                  color: 'var(--primary)'
                }} />
              </div>
              <h2 className="text-apple-title1 mb-4" style={{ color: 'var(--foreground)' }}>
                Chat with the General
              </h2>
              <p className="text-apple-title3 max-w-2xl mx-auto" style={{
                color: 'var(--muted-foreground)',
                fontWeight: 400
              }}>
                Describe your incident and let the General guide you through the compliance process step by step
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
              <Link href="/chat">
                <Button style={{
                  width: '100%',
                  minHeight: '64px',
                  fontSize: '20px'
                }}>
                  <Brain style={{ width: '24px', height: '24px', marginRight: 'var(--spacing-4)' }} />
                  Start Chat with the General
                </Button>
              </Link>
              <div className="text-center">
                <p className="text-apple-footnote" style={{ color: 'var(--muted-foreground)' }}>
                  The General will ask questions, classify incidents, and ensure compliance
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <Link href="/incidents/active">
            <div className="card-apple elevation-1 group cursor-pointer" style={{
              padding: 'var(--spacing-6)',
              transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}>
              <div className="flex flex-row items-center justify-between mb-4">
                <h3 className="text-apple-caption1 font-medium uppercase" style={{
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.06em'
                }}>Active Incidents</h3>
                <div style={{
                  padding: 'var(--spacing-2)',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(100, 210, 255, 0.15)',
                  transition: 'background 0.2s'
                }}>
                  <FileText style={{ width: '20px', height: '20px', color: 'var(--info)' }} />
                </div>
              </div>
              <div className="text-apple-title2 font-bold mb-2" style={{ color: 'var(--foreground)' }}>12 Active</div>
              <p className="text-apple-footnote flex items-center" style={{ color: 'var(--muted-foreground)' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  background: 'var(--info)',
                  borderRadius: '50%',
                  marginRight: 'var(--spacing-2)'
                }}></span>
                Manage ongoing cases
              </p>
            </div>
          </Link>

          <Link href="/incidents/pending">
            <div className="card-apple elevation-1 group cursor-pointer" style={{
              padding: 'var(--spacing-6)',
              transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}>
              <div className="flex flex-row items-center justify-between mb-4">
                <h3 className="text-apple-caption1 font-medium uppercase" style={{
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.06em'
                }}>Pending Actions</h3>
                <div style={{
                  padding: 'var(--spacing-2)',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(255, 214, 10, 0.15)',
                  transition: 'background 0.2s'
                }}>
                  <Clock style={{ width: '20px', height: '20px', color: 'var(--warning)' }} />
                </div>
              </div>
              <div className="text-apple-title2 font-bold mb-2" style={{ color: 'var(--foreground)' }}>8 Pending</div>
              <p className="text-apple-footnote flex items-center" style={{ color: 'var(--muted-foreground)' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  background: 'var(--warning)',
                  borderRadius: '50%',
                  marginRight: 'var(--spacing-2)'
                }}></span>
                Review required actions
              </p>
            </div>
          </Link>

          <Link href="/incidents/closed">
            <div className="card-apple elevation-1 group cursor-pointer" style={{
              padding: 'var(--spacing-6)',
              transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}>
              <div className="flex flex-row items-center justify-between mb-4">
                <h3 className="text-apple-caption1 font-medium uppercase" style={{
                  color: 'var(--muted-foreground)',
                  letterSpacing: '0.06em'
                }}>Closed Cases</h3>
                <div style={{
                  padding: 'var(--spacing-2)',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(48, 209, 88, 0.15)',
                  transition: 'background 0.2s'
                }}>
                  <CheckCircle style={{ width: '20px', height: '20px', color: 'var(--success)' }} />
                </div>
              </div>
              <div className="text-apple-title2 font-bold mb-2" style={{ color: 'var(--foreground)' }}>24 Closed</div>
              <p className="text-apple-footnote flex items-center" style={{ color: 'var(--muted-foreground)' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  background: 'var(--success)',
                  borderRadius: '50%',
                  marginRight: 'var(--spacing-2)'
                }}></span>
                View completed cases
              </p>
            </div>
          </Link>
        </div>

        {/* Footer Section */}
        <div className="text-center mt-20 pt-8" style={{ borderTop: '0.5px solid var(--separator)' }}>
          <h3 className="text-apple-title3 font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
            Built for School Administrators
          </h3>
          <p className="text-apple-body max-w-2xl mx-auto mb-6" style={{ color: 'var(--muted-foreground)' }}>
            Chat with the General for AI-powered compliance guidance and proper incident handling
          </p>
          <div className="flex justify-center gap-8">
            <span className="flex items-center text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>
              <Shield style={{ width: '14px', height: '14px', marginRight: '4px', color: 'var(--success)' }} />
              Privacy-First
            </span>
            <span className="flex items-center text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>
              <Brain style={{ width: '14px', height: '14px', marginRight: '4px', color: 'var(--info)' }} />
              General-Powered
            </span>
            <span className="flex items-center text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>
              <CheckCircle style={{ width: '14px', height: '14px', marginRight: '4px', color: 'var(--primary)' }} />
              Compliance-Focused
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}