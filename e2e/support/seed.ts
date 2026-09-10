import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/generated/prisma';
import { parsePolicySections } from '../../src/lib/policy-sections';
import { splitPolicyIntoSectionedChunks } from '../../src/lib/utils/documentProcessor';
import { attachmentUploadsDir } from '../../src/lib/uploads';

export const TEST_PASSWORD = 'e2e-test-password-1';

export const TEST_USERS = {
  admin: { email: 'e2e-admin@example.test', name: 'E2E Admin', role: 'admin' },
  reporter: { email: 'e2e-reporter@example.test', name: 'E2E Reporter', role: 'reporter' },
  /**
   * Signed in like the others and then deleted mid-test, to prove a session
   * outlives its account by nothing.
   *
   * It exists as a seeded user rather than one the test creates because the
   * test must not sign in: `navigation.spec.ts` deliberately floods the
   * credentials endpoint until the limiter refuses it, so a test signing in
   * afterwards is refused too and hangs on "Signing in...". Sessions are
   * minted in `auth.setup.ts`, which runs before any of that. It owns no
   * incidents, so deleting it cascades nowhere.
   */
  revocable: { email: 'e2e-revocable@example.test', name: 'E2E Revocable', role: 'reporter' },
} as const;

/** Resets the e2e database to a known state. */
/** Ids a test needs to attempt access it must not be granted. */
export interface SeededIds {
  adminIncidentId: string;
  adminObligationId: string;
  /**
   * One attachment per user, with real bytes on disk. `CLAUDE.md` names
   * attachments an invariant -- "Attachments are student records ... served only
   * through `GET /api/attachments/[id]`, which re-checks session and ownership"
   * -- and without a real `Attachment` row the ownership check, the
   * 404-not-403 response, the containment assertion and the three response
   * headers all go unexercised.
   */
  reporterAttachmentId: string;
  adminAttachmentId: string;
  /** The reporter's own open incident, for assertions about its own page. */
  reporterIncidentId: string;
  closedIncidentId: string;
}

export async function resetDatabase(): Promise<SeededIds> {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });

  const prisma = new PrismaClient();
  try {
    // Order matters: children before parents.
    await prisma.auditLog.deleteMany();
    await prisma.complianceAction.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.policyChunk.deleteMany();
    await prisma.policy.deleteMany();
    await prisma.systemPrompt.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    for (const user of Object.values(TEST_USERS)) {
      await prisma.user.create({ data: { ...user, passwordHash } });
    }

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.admin.email },
    });
    const reporter = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.reporter.email },
    });

    // Policies across three jurisdictions in the same category, so retrieval
    // can be asserted to assemble an answer from all of them -- plus a
    // category (restraint_seclusion) with only federal/state coverage and no
    // local policy, so the coverage-gap path is exercised too.
    const policies = [
      {
        title: 'Title IX (34 CFR Part 106)',
        jurisdiction: 'federal',
        category: 'bullying',
        content:
          'Federal requirement: schools must respond promptly to conduct that ' +
          'denies a person equal access to an education program. Bullying that ' +
          'is severe or pervasive triggers a formal response obligation.',
      },
      {
        title: 'RSA 193-F: Pupil Safety and Violence Prevention',
        jurisdiction: 'state',
        category: 'bullying',
        content:
          'State requirement: the principal must notify the parents of both the ' +
          'targeted student and the perpetrator within 48 hours of a reported ' +
          'bullying incident, and complete an investigation within 5 school days.',
      },
      {
        title: 'Policy JICK: Bullying Prevention',
        jurisdiction: 'district',
        category: 'bullying',
        // Lettered sections, as the real NHSBA policy is written. The seed
        // chunks this through the production parser, so the section-level
        // citation shown in chat is produced the same way it is in the pilot
        // rather than hand-written into the fixture.
        content: [
          'D. Procedures for Reporting Bullying - RSA 193-F:4, II(f) - (h).',
          'District procedure: staff must report suspected bullying to the',
          'superintendent within 24 hours and document the incident in PowerSchool.',
          '',
          'F. Investigative Procedures - RSA 193-F:4, II(k).',
          'The principal shall complete an investigation within 5 school days.',
        ].join('\n'),
      },
      {
        title: 'Policy JLF: Reporting Child Abuse and Neglect',
        jurisdiction: 'district',
        category: 'mandatory_reporting',
        content:
          'District procedure: any staff member with reason to suspect abuse or ' +
          'neglect must report to DCYF immediately and notify the superintendent.',
      },
      {
        title: 'Policy JIC: Student Conduct',
        jurisdiction: 'district',
        category: 'discipline',
        content:
          'District procedure: disciplinary consequences must be applied ' +
          'consistently and documented in the student information system.',
      },
      {
        // Federal-only, no local counterpart: exercises the scope note, which
        // is the pilot's common case for anything outside the loaded subject.
        title: '34 CFR 300.34: Restraint and Seclusion Guidance',
        jurisdiction: 'federal',
        category: 'restraint_seclusion',
        content:
          'Federal guidance: physical restraint may be used only when a student ' +
          'poses an imminent danger of serious physical harm to self or others.',
      },
    ];

    // Active, district, school_safety -- and deliberately given NO chunks below.
    // Retrieval can never return it, so it must not count as coverage. This is
    // the production state a failed re-index leaves behind, and counting it
    // suppressed the gap warning that says the library is empty.
    const unchunked = {
      title: 'Policy EBCA: Crisis Response (indexing incomplete)',
      jurisdiction: 'district',
      category: 'school_safety',
      content: 'District procedure: unavailable -- this policy has not been indexed.',
    };

    for (const p of policies) {
      const created = await prisma.policy.create({
        data: {
          title: p.title,
          content: p.content,
          jurisdiction: p.jurisdiction,
          category: p.category,
          effectiveDate: new Date('2024-01-01'),
          isActive: true,
        },
      });
      const sections = parsePolicySections(p.content);
      const chunks = splitPolicyIntoSectionedChunks(p.content, sections);
      await prisma.policyChunk.createMany({
        data: chunks.map((chunk, index) => ({
          policyId: created.id,
          chunkIndex: index,
          content: chunk.content,
          sectionLabel: chunk.sectionLabel ?? null,
          sectionTitle: chunk.sectionTitle ?? null,
          sectionStatute: chunk.sectionStatute ?? null,
        })),
      });
    }

    await prisma.policy.create({
      data: {
        title: unchunked.title,
        content: unchunked.content,
        jurisdiction: unchunked.jurisdiction,
        category: unchunked.category,
        effectiveDate: new Date('2024-01-01'),
        isActive: true,
      },
    });

    // One open incident owned by the reporter, one closed, and one owned by
    // the admin so cross-user access can be asserted.
    await prisma.incident.create({
      data: {
        title: 'Bullying: Playground incident',
        description: 'A student was repeatedly targeted by a peer during recess.',
        status: 'open',
        severity: 'high',
        incidentType: 'bullying',
        reporterId: reporter.id,
      },
    });
    // Obligations on the seeded open incident, so tests that exercise the
    // queue do not depend on an earlier test having created some.
    //
    // Three, covering the three states the queue treats differently. The
    // default `deadlineSource: 'model'`, and every obligation the chat flow
    // creates during a run is in the future -- so without a seeded overdue
    // policy-backed row, `counts.overdue`, `counts.today` and the whole
    // Overdue group are always zero across the suite, and inverting the
    // overdue comparison or dropping the policy-backed filter from the
    // tallies is invisible.
    const openIncident = await prisma.incident.findFirstOrThrow({
      where: { title: 'Bullying: Playground incident' },
    });
    const backingPolicy = await prisma.policy.findFirstOrThrow({
      where: { title: 'Policy JICK: Bullying Prevention' },
    });
    await prisma.complianceAction.createMany({
      data: [
        {
          // Policy-backed and late: the only row that may produce a red
          // countdown, the "One thing is late." headline and counts.overdue.
          incidentId: openIncident.id,
          actionType: 'reporting',
          description: 'Report the incident to the superintendent',
          status: 'pending',
          dueDate: new Date(Date.now() - 26 * 60 * 60 * 1000),
          deadlineSource: 'policy',
          policyId: backingPolicy.id,
          citation: 'JICK §D — Procedures for Reporting Bullying (RSA 193-F:4, II(f) - (h))',
        },
        {
          // Unverified and late. Must appear in the queue -- under its own
          // heading, without red -- and must not be counted as late.
          incidentId: openIncident.id,
          actionType: 'notification',
          description: 'Notify the parents of both students',
          status: 'pending',
          dueDate: new Date(Date.now() - 3 * 60 * 60 * 1000),
          deadlineSource: 'model',
        },
        {
          incidentId: openIncident.id,
          actionType: 'investigation',
          description: 'Complete the investigation summary',
          status: 'pending',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          deadlineSource: 'model',
        },
      ],
    });

    const closedIncident = await prisma.incident.create({
      data: {
        title: 'Harassment: Resolved hallway incident',
        description: 'Resolved after mediation.',
        status: 'closed',
        severity: 'low',
        incidentType: 'harassment',
        reporterId: reporter.id,
        closedAt: new Date(),
      },
    });
    // The admin's incident carries an obligation of its own. Without one there
    // is no foreign row for a reporter to attempt, so the cross-user tests had
    // to PATCH an id that does not exist -- which 404s whether or not scoping
    // is applied, and so could not fail.
    const adminIncident = await prisma.incident.create({
      data: {
        title: 'Title IX: Admin-only incident',
        description: 'Only the admin filed this one.',
        status: 'open',
        severity: 'critical',
        incidentType: 'title_ix',
        reporterId: admin.id,
        complianceActions: {
          create: {
            actionType: 'notification',
            description: 'Notify the Title IX coordinator',
            status: 'pending',
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { complianceActions: true },
    });

    // Attachments, with bytes actually on disk so the download path is real.
    // The directory is the one the app resolves, so a test asserting the file
    // is not reachable under public/ is asserting the deployed arrangement.
    const uploadsDir = attachmentUploadsDir();
    mkdirSync(uploadsDir, { recursive: true });

    const attachmentFixtures = [
      {
        storedName: 'e2e-reporter-statement.txt',
        filename: 'witness-statement.txt',
        body: 'E2E fixture: witness statement filed by the reporter.',
        incidentId: openIncident.id,
        uploadedBy: reporter.id,
      },
      {
        storedName: 'e2e-admin-statement.txt',
        filename: 'title-ix-notes.txt',
        body: 'E2E fixture: Title IX notes filed by the admin.',
        incidentId: adminIncident.id,
        uploadedBy: admin.id,
      },
    ];

    const attachmentIds: Record<string, string> = {};
    for (const fixture of attachmentFixtures) {
      writeFileSync(join(uploadsDir, fixture.storedName), fixture.body, 'utf8');
      const row = await prisma.attachment.create({
        data: {
          filename: fixture.filename,
          filePath: fixture.storedName,
          fileType: 'text/plain',
          fileSize: Buffer.byteLength(fixture.body),
          incidentId: fixture.incidentId,
          uploadedBy: fixture.uploadedBy,
        },
      });
      attachmentIds[fixture.storedName] = row.id;
    }

    return {
      adminIncidentId: adminIncident.id,
      adminObligationId: adminIncident.complianceActions[0].id,
      reporterIncidentId: openIncident.id,
      closedIncidentId: closedIncident.id,
      reporterAttachmentId: attachmentIds['e2e-reporter-statement.txt'],
      adminAttachmentId: attachmentIds['e2e-admin-statement.txt'],
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Set a seeded user's role, returning the role it had.
 *
 * Exists so a test can revoke a privilege on a session that is already signed
 * in, which is the only state in which a role read from the JWT rather than
 * the user row would go stale. Nothing else in the suite can produce it --
 * the storage states are minted once, in `auth.setup.ts`, and never
 * re-signed-in.
 *
 * The suite runs `workers: 1, fullyParallel: false`, so a test may mutate a
 * shared user for the length of one test. It must put the role back.
 */
/**
 * Put the advisor profile back to the state `resetDatabase` leaves: none
 * configured, so the app is running on the in-code default.
 *
 * The profile tests write real rows, and one of them asserts that no undo is
 * offered before anything has been saved. That is only true from a clean
 * start, so they cannot inherit a row from an earlier attempt -- a retry would
 * otherwise begin one save further along and pass or fail on leftovers.
 */
export async function clearAdvisorProfiles(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.systemPrompt.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}

export async function setUserRole(email: string, role: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { role: true },
    });
    await prisma.user.update({ where: { email }, data: { role } });
    return before.role;
  } finally {
    await prisma.$disconnect();
  }
}

/** Remove a seeded account, to prove its live session dies with it. */
export async function deleteUserByEmail(email: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany({ where: { email } });
  } finally {
    await prisma.$disconnect();
  }
}
