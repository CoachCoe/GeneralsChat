'use client';

import Navbar from '@/components/Navbar';

/**
 * How the system works, in the terms an administrator needs.
 *
 * Reachable without a session, so it says nothing about a particular district:
 * not which policies are loaded, not which subjects are covered, not an
 * incident. The version of this that knows those things is the note in the
 * chat's empty state, which is behind a sign-in.
 *
 * It replaced a feature list. Two of its claims had become false -- the advisor
 * profile is fixed for the testing round, and "guidance based on your district
 * policies" promised something the library decides rather than the product --
 * and a page linked from "How this works" that is wrong about how it works is
 * worse than no link.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className="font-display text-[22px] leading-[1.2]"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </h2>
      <div
        className="flex flex-col gap-3 text-[15px] leading-[1.65]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <main className="mx-auto flex max-w-[720px] flex-col gap-9 px-6 py-12">
        <header className="flex flex-col gap-3">
          <span className="eyebrow">How this works</span>
          <h1
            className="font-display text-[34px] leading-[1.15] tracking-[-0.02em]"
            style={{ color: 'var(--color-text)' }}
          >
            A compliance assistant, and what it is not
          </h1>
        </header>

        <Section title="What it does">
          <p>
            You describe an incident in your own words. It works out what kind of incident it is,
            finds the policy that applies — federal, state, district and school — and tells you
            what has to happen and by when. Those obligations become a queue with deadlines, and
            the queue is the part you work from.
          </p>
        </Section>

        <Section title="What the answers rest on">
          <p>
            Only the policy documents your district has loaded. Beside every answer is a list of
            what it was drawn from, down to the provision, so you can check it against the
            document rather than take it on trust.
          </p>
          <p>
            Where nothing local is loaded for a subject, it says so instead of answering from
            state or federal law as though that were your district&apos;s procedure. That is the
            point: being told &ldquo;nothing local covers this&rdquo; tells you to go and ask. A
            confident answer would not.
          </p>
          <p>
            A deadline is shown as late only when a policy it retrieved actually states it.
            Deadlines it could not tie to a document are still listed, and still say they need
            confirming.
          </p>
        </Section>

        <Section title="What not to type">
          <p>
            Leave names and other identifying details out. Describe people by role — the reported
            student, the parent, the staff member. What you type becomes part of the incident
            record, and the assistant will remind you if it sees a name.
          </p>
        </Section>

        <Section title="What it produces">
          <p>
            A mandatory-report draft on your district&apos;s own form, a consultation summary, and
            the full transcript. Each one prints, and each can be downloaded.
          </p>
          <p>
            They are drafts. Fields the record cannot answer are left blank rather than guessed —
            names, ages, grades and dates of the incident are in your account of it, and inferring
            them is how a report names the wrong child. You check it, complete it and file it.
          </p>
        </Section>

        <Section title="Working with other people">
          <p>
            You can share an incident with a colleague. Sharing lets them read it and its
            documents; changing it, marking obligations done and sharing it further stay with you.
            There is a separate place for messages between people, which is not the assistant and
            is not part of any incident record.
          </p>
        </Section>

        <Section title="What it does not do">
          <p>
            It does not file anything, notify anyone outside this application, or send email.
            Nothing here reaches a parent, a superintendent or a state agency unless you send it.
            It does not decide whether something is bullying; it tells you what the policy
            requires and leaves the finding to you.
          </p>
        </Section>
      </main>
    </div>
  );
}
