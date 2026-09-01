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

    // A policy the keyword fallback can actually retrieve.
    const policy = await prisma.policy.create({
      data: {
        title: 'Policy JICK: Bullying Prevention',
        content:
          'Bullying is prohibited. Staff must report suspected bullying to the ' +
          'superintendent within 24 hours and document the incident in PowerSchool.',
        policyType: 'district',
        effectiveDate: new Date('2024-01-01'),
        isActive: true,
      },
    });
    await prisma.policyChunk.create({
      data: {
        policyId: policy.id,
        chunkIndex: 0,
        content:
          'Bullying is prohibited. Staff must report suspected bullying to the ' +
          'superintendent within 24 hours and document the incident in PowerSchool.',
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
