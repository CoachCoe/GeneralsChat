import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/db';

config({ path: resolve(__dirname, '../.env') });

async function uploadPolicies() {
  console.log('📚 Uploading policies directly to database...\n');

  // Policy 1: Bullying Prevention
  const bullyingContent = readFileSync(
    resolve(__dirname, '../sample-policies/bullying-prevention-policy.txt'),
    'utf-8'
  );

  const bullyingPolicy = await prisma.policy.create({
    data: {
      title: 'School District Bullying Prevention and Intervention Policy',
      content: bullyingContent,
      policyType: 'district',
      effectiveDate: new Date('2024-09-01'),
      version: 1,
      isActive: true,
      metadata: JSON.stringify({
        code: 'DISC-001',
        category: 'bullying',
        keywords: ['bullying', 'harassment', 'intervention', 'prevention'],
      }),
    },
  });

  // Create chunks for bullying policy
  const bullyingChunks = bullyingContent.match(/.{1,500}/g) || [];
  for (let i = 0; i < bullyingChunks.length; i++) {
    await prisma.policyChunk.create({
      data: {
        policyId: bullyingPolicy.id,
        content: bullyingChunks[i],
        chunkIndex: i,
        metadata: JSON.stringify({
          keywords: ['bullying', 'harassment', 'DISC-001'],
        }),
      },
    });
  }

  console.log(`✅ Uploaded: ${bullyingPolicy.title} (${bullyingChunks.length} chunks)`);

  // Policy 2: Bus Conduct
  const busContent = readFileSync(
    resolve(__dirname, '../sample-policies/student-conduct-school-buses.txt'),
    'utf-8'
  );

  const busPolicy = await prisma.policy.create({
    data: {
      title: 'Student Conduct on School Buses',
      content: busContent,
      policyType: 'district',
      effectiveDate: new Date('2024-08-15'),
      version: 1,
      isActive: true,
      metadata: JSON.stringify({
        code: 'EEACC',
        category: 'transportation',
        keywords: ['bus', 'transportation', 'conduct', 'safety'],
      }),
    },
  });

  const busChunks = busContent.match(/.{1,500}/g) || [];
  for (let i = 0; i < busChunks.length; i++) {
    await prisma.policyChunk.create({
      data: {
        policyId: busPolicy.id,
        content: busChunks[i],
        chunkIndex: i,
        metadata: JSON.stringify({
          keywords: ['bus', 'transportation', 'EEACC'],
        }),
      },
    });
  }

  console.log(`✅ Uploaded: ${busPolicy.title} (${busChunks.length} chunks)`);

  // Policy 3: Title IX
  const titleIXContent = readFileSync(
    resolve(__dirname, '../sample-policies/title-ix-policy-update-2025.txt'),
    'utf-8'
  );

  const titleIXPolicy = await prisma.policy.create({
    data: {
      title: 'Title IX Sexual Harassment Policy - 2025 Update',
      content: titleIXContent,
      policyType: 'federal',
      effectiveDate: new Date('2025-01-01'),
      version: 2,
      isActive: true,
      metadata: JSON.stringify({
        code: 'ACAC',
        category: 'title_ix',
        keywords: ['title ix', 'sexual harassment', 'discrimination', 'ACAC'],
      }),
    },
  });

  const titleIXChunks = titleIXContent.match(/.{1,500}/g) || [];
  for (let i = 0; i < titleIXChunks.length; i++) {
    await prisma.policyChunk.create({
      data: {
        policyId: titleIXPolicy.id,
        content: titleIXChunks[i],
        chunkIndex: i,
        metadata: JSON.stringify({
          keywords: ['title ix', 'sexual harassment', 'ACAC'],
        }),
      },
    });
  }

  console.log(`✅ Uploaded: ${titleIXPolicy.title} (${titleIXChunks.length} chunks)`);

  console.log('\n🎉 All policies uploaded successfully!');
  console.log(`Total: 3 policies, ${bullyingChunks.length + busChunks.length + titleIXChunks.length} chunks`);
}

uploadPolicies()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
