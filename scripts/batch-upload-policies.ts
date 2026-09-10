import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';

config({ path: resolve(__dirname, '../.env') });

/**
 * Uploads a fixed list of policy files through the admin ingestion route.
 *
 * Put the files in sample-policies/, list them in `policies` below, and run
 * `npm run policies:batch-upload`.
 */
interface PolicyUpload {
  file: string;          // Filename in sample-policies/
  title: string;         // e.g. "JLDBB - Suicide Prevention"
  /** Who issued it: federal | state | district | school */
  jurisdiction: string;
  /** What it covers; one of the 20 values of `PolicyCategory` in src/types. */
  category: string;
  effectiveDate: string; // YYYY-MM-DD
}

/** Base URL for the running dev server; `npm run dev` binds :3000. */
const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

/**
 * The canonical ingestion route. It sits under the `/api/admin` prefix the
 * middleware gates; there is no ungated ingestion route to post to.
 */
const UPLOAD_URL = `${BASE_URL}/api/admin/policies/upload`;

/**
 * The route is admin-gated in its handler as well as by the middleware, so a
 * cookieless run gets 401 rather than an upload. Sign in through the UI, copy
 * the `authjs.session-token` cookie, and export it as APP_SESSION_COOKIE --
 * the same contract the other scripts here use. Checked up front rather than
 * once per file, so a missing cookie is one clear message and not N failures.
 */
const SESSION_COOKIE = process.env.APP_SESSION_COOKIE ?? '';
if (!SESSION_COOKIE) {
  console.error(
    'APP_SESSION_COOKIE is not set, so every upload would return 401.\n' +
      'Sign in as an admin, copy the `authjs.session-token` cookie, and:\n' +
      '  APP_SESSION_COOKIE=<value> npm run policies:batch-upload'
  );
  process.exit(1);
}
const AUTH_HEADERS: Record<string, string> = {
  Cookie: `authjs.session-token=${SESSION_COOKIE}`,
};

const policies: PolicyUpload[] = [
  // { file: 'jlf-mandatory-reporting.pdf',
  //   title: 'JLF - Reporting Child Abuse and Neglect',
  //   jurisdiction: 'district', category: 'mandatory_reporting',
  //   effectiveDate: '2019-01-01' },
];

async function uploadPolicies() {
  if (policies.length === 0) {
    console.log('⚠️  No policies defined for upload.');
    console.log('\nTo use this script:');
    console.log('1. Save policy documents in sample-policies/ directory');
    console.log('2. Edit this file and uncomment/add policy definitions');
    console.log('3. Run: npx tsx scripts/batch-upload-policies.ts\n');
    return;
  }

  console.log(`📚 Batch uploading ${policies.length} policies...\n`);
  console.log('='.repeat(80));

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const policy of policies) {
    const filePath = resolve(__dirname, '../sample-policies', policy.file);

    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠️  SKIPPED: ${policy.title}`);
      console.log(`   File not found: ${policy.file}`);
      skipCount++;
      continue;
    }

    try {
      const form = new FormData();
      form.append('title', policy.title);
      form.append('jurisdiction', policy.jurisdiction);
      form.append('category', policy.category);
      form.append('effectiveDate', policy.effectiveDate);

      const ext = policy.file.toLowerCase();
      let contentType = 'text/plain';
      if (ext.endsWith('.pdf')) contentType = 'application/pdf';
      else if (ext.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      form.append(
        'file',
        new Blob([fs.readFileSync(filePath)], { type: contentType }),
        policy.file
      );

      // fetch sets the multipart boundary itself; do not set Content-Type.
      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: form,
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`\n✅ UPLOADED: ${policy.title}`);
        console.log(`   ${policy.jurisdiction} / ${policy.category}`);
        console.log(`   File: ${policy.file}`);
        console.log(`   Chunks: ${data.chunksCreated || 'N/A'}`);
        successCount++;
      } else {
        const errorText = await response.text();
        console.log(`\n❌ FAILED: ${policy.title}`);
        console.log(`   Error: ${response.statusText}`);
        console.log(`   Details: ${errorText.substring(0, 200)}`);
        errorCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.log(`\n❌ ERROR: ${policy.title}`);
      console.log(`   ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Upload Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ⚠️  Skipped: ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📁 Total: ${policies.length}\n`);

  if (successCount > 0) {
    console.log('🎉 Policies uploaded successfully!');
    console.log('   They are now available in the RAG system for incident classification.\n');
  }
}

uploadPolicies().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
