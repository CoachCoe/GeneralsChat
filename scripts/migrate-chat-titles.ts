import { prisma } from '../src/lib/db';

/**
 * Migration script to enhance existing chat titles with incident type classification
 *
 * This will update all incidents that have a classification but don't have
 * the incident type prefix in their title yet.
 */

const typeLabels: Record<string, string> = {
  bullying: 'Bullying',
  title_ix: 'Title IX',
  harassment: 'Harassment',
  violence: 'Violence',
  substance: 'Substance',
  other: 'Other'
};

async function migrateChatTitles() {
  console.log('🔄 Starting chat title migration...\n');

  try {
    // Find all incidents that have a type but might not have enhanced titles
    const incidents = await prisma.incident.findMany({
      where: {
        incidentType: {
          not: null,
        },
      },
      select: {
        id: true,
        title: true,
        incidentType: true,
      },
    });

    console.log(`Found ${incidents.length} incidents with classifications\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const incident of incidents) {
      if (!incident.incidentType) continue;

      const typeLabel = typeLabels[incident.incidentType] || 'Incident';

      // Check if title already has the type prefix
      if (incident.title.startsWith(typeLabel + ':')) {
        console.log(`⏭️  Skipping "${incident.title}" (already has prefix)`);
        skippedCount++;
        continue;
      }

      // Enhance the title
      const enhancedTitle = `${typeLabel}: ${incident.title}`;

      // Update the incident
      await prisma.incident.update({
        where: { id: incident.id },
        data: { title: enhancedTitle },
      });

      console.log(`✅ Updated: "${incident.title}" → "${enhancedTitle}"`);
      updatedCount++;
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total incidents: ${incidents.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped (already enhanced): ${skippedCount}`);
    console.log('\n✨ Migration complete!\n');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateChatTitles();
