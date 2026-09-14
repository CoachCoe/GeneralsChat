import { prisma } from '../src/lib/db.js';
import { requireTestDatabase } from './support/require-test-database';
import { DEFAULT_ADVISOR_PROFILE } from '../src/lib/ai/advisor-profile';
import { DEFAULT_PROFILE_NAME } from '../src/lib/system-prompt';

async function checkAndSeed() {
  requireTestDatabase('scripts/seed-prompt.ts');

  try {
    // Check if SystemPrompt table has any records
    const count = await prisma.systemPrompt.count();
    console.log('SystemPrompt count:', count);

    if (count === 0) {
      console.log('Creating default system prompt...');
      /*
       * The profile the code ships with, not a second copy written here.
       *
       * This script had its own hardcoded text, so a fresh setup following the
       * README got a profile that differed from `DEFAULT_ADVISOR_PROFILE` -- and
       * with editing off for the testing round, one that could not be changed
       * through the UI. Two texts claiming to be the default is one too many.
       */
      const defaultPrompt = await prisma.systemPrompt.create({
        data: {
          name: DEFAULT_PROFILE_NAME,
          content: DEFAULT_ADVISOR_PROFILE,
          isActive: true,
        },
      });
      console.log('Created default prompt:', defaultPrompt.id);
    }

    const prompts = await prisma.systemPrompt.findMany();
    console.log('All prompts:', prompts.map(p => ({ id: p.id, name: p.name, isActive: p.isActive })));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndSeed();
