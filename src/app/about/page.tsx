'use client';

import Navbar from '@/components/Navbar';

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-semibold mb-8" style={{ color: 'var(--foreground)' }}>
          About
        </h1>

        <div className="space-y-6" style={{ color: 'var(--foreground)' }}>
          <section>
            <h2 className="text-2xl font-semibold mb-4">School Compliance AI</h2>
            <p className="text-lg" style={{ color: 'var(--muted-foreground)' }}>
              An intelligent assistant designed to help school administrators navigate complex compliance scenarios
              with confidence and clarity.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Features</h2>
            <ul className="list-disc list-inside space-y-2 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              <li>AI-powered policy analysis and recommendations</li>
              <li>Real-time compliance guidance based on your district policies</li>
              <li>Customizable system prompts for tailored responses</li>
              <li>Comprehensive policy management and search</li>
              <li>Incident tracking and documentation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Technology</h2>
            <p className="text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Powered by Claude AI (Anthropic) for intelligent, context-aware responses that help you make informed
              decisions while maintaining compliance with school policies and regulations.
            </p>
          </section>

          <section className="pt-8 border-t" style={{ borderColor: 'var(--separator)' }}>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Version 1.0.0
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
