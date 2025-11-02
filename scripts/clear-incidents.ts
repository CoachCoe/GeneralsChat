import { prisma } from '../src/lib/db';

async function clearIncidents() {
  try {
    console.log('🗑️  Clearing incidents data...');

    // Delete in order due to foreign key constraints
    console.log('Deleting audit logs...');
    await prisma.auditLog.deleteMany({});

    console.log('Deleting compliance actions...');
    await prisma.complianceAction.deleteMany({});

    console.log('Deleting attachments...');
    await prisma.attachment.deleteMany({});

    console.log('Deleting conversations...');
    await prisma.conversation.deleteMany({});

    console.log('Deleting incidents...');
    const result = await prisma.incident.deleteMany({});

    console.log(`✅ Successfully deleted ${result.count} incidents and all related data`);
  } catch (error) {
    console.error('❌ Error clearing incidents:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearIncidents();
