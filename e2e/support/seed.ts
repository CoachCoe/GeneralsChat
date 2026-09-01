import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/generated/prisma';

export const TEST_PASSWORD = 'e2e-test-password-1';

export const TEST_USERS = {
  admin: { email: 'e2e-admin@example.test', name: 'E2E Admin', role: 'admin' },
  reporter: { email: 'e2e-reporter@example.test', name: 'E2E Reporter', role: 'reporter' },
} as const;

/**
 * Resets the e2e database to a known state.
 *
 * The suite previously shared one mutable database with no isolation and ran
 * fully parallel, so an empty-state test and an incident-creating test raced
 * each other. (TEST-21)
 */
export async function resetDatabase(): Promise<void> {
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
        content:
          'District procedure: staff must report suspected bullying to the ' +
          'superintendent within 24 hours and document the incident in PowerSchool.',
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
      await prisma.policyChunk.create({
        data: { policyId: created.id, chunkIndex: 0, content: p.content },
      });
    }

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
    // queue do not depend on an earlier test having created some. One overdue,
    // one upcoming.
    const openIncident = await prisma.incident.findFirstOrThrow({
      where: { title: 'Bullying: Playground incident' },
    });
    await prisma.complianceAction.createMany({
      data: [
        {
          incidentId: openIncident.id,
          actionType: 'notification',
          description: 'Notify the parents of both students',
          status: 'pending',
          dueDate: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
        {
          incidentId: openIncident.id,
          actionType: 'investigation',
          description: 'Complete the investigation summary',
          status: 'pending',
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    await prisma.incident.create({
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
    await prisma.incident.create({
      data: {
        title: 'Title IX: Admin-only incident',
        description: 'Only the admin filed this one.',
        status: 'open',
        severity: 'critical',
        incidentType: 'title_ix',
        reporterId: admin.id,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
