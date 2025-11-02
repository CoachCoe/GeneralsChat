import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

config({ path: resolve(__dirname, '../.env') });

/**
 * Batch Policy Upload Script
 *
 * Add your policy files to sample-policies/ directory, then define them below.
 * The script will automatically upload each policy to the vector database.
 */

interface PolicyUpload {
  file: string;                  // Filename in sample-policies/
  title: string;                 // Policy title (e.g., "JLDBB - Suicide Prevention")
  type: string;                  // Policy type (see options below)
  effectiveDate: string;         // YYYY-MM-DD format
}

/**
 * POLICY TYPE OPTIONS:
 * - suicide_prevention
 * - title_ix
 * - discrimination
 * - mandatory_reporting
 * - restraint_seclusion
 * - bullying
 * - school_safety
 * - discipline
 * - student_health
 * - athletic_safety
 * - student_records
 * - enrollment
 * - attendance
 * - field_trips
 * - emergency_operations
 * - technology
 * - background_checks
 * - employee
 * - parental_rights
 * - chemical_safety
 */

const policies: PolicyUpload[] = [
  // ============================================================================
  // PRIORITY 1: IMMEDIATE SAFETY & LEGAL REQUIREMENTS
  // ============================================================================

  // Uncomment and add your files:

  // {
  //   file: 'jldbb-suicide-prevention.pdf',
  //   title: 'JLDBB - Suicide Prevention',
  //   type: 'suicide_prevention',
  //   effectiveDate: '2024-01-01'
  // },
  // {
  //   file: 'jlf-mandatory-reporting.pdf',
  //   title: 'JLF - Reporting Child Abuse and Neglect',
  //   type: 'mandatory_reporting',
  //   effectiveDate: '2019-01-01'
  // },
  // {
  //   file: 'jkaa-restraint-seclusion.pdf',
  //   title: 'JKAA - Use of Restraint and Seclusion',
  //   type: 'restraint_seclusion',
  //   effectiveDate: '2023-01-01'
  // },

  // ============================================================================
  // PRIORITY 2: DISCRIMINATION & COMPLIANCE
  // ============================================================================

  // {
  //   file: 'ac-nondiscrimination.pdf',
  //   title: 'AC - Nondiscrimination, EOE, Anti-Discrimination Plan',
  //   type: 'discrimination',
  //   effectiveDate: '2024-01-01'
  // },
  // {
  //   file: 'jra-student-records.pdf',
  //   title: 'JRA - Access to Educational Records (FERPA)',
  //   type: 'student_records',
  //   effectiveDate: '2012-01-01'
  // },

  // ============================================================================
  // PRIORITY 3: SCHOOL SAFETY & OPERATIONS
  // ============================================================================

  // {
  //   file: 'mou-police-departments.pdf',
  //   title: 'MOU - Police Departments',
  //   type: 'school_safety',
  //   effectiveDate: '2024-01-01'
  // },
  // {
  //   file: 'jicdd-cyberbullying.pdf',
  //   title: 'JICDD - Cyberbullying',
  //   type: 'bullying',
  //   effectiveDate: '2018-01-01'
  // },
  // {
  //   file: 'ebca-emergency-response.pdf',
  //   title: 'EBCA - Crisis Prevention and Emergency Response Plans',
  //   type: 'emergency_operations',
  //   effectiveDate: '2020-01-01'
  // },

  // ============================================================================
  // PRIORITY 4: STUDENT DISCIPLINE & CONDUCT
  // ============================================================================

  // {
  //   file: 'jic-student-conduct.pdf',
  //   title: 'JIC - Student Conduct',
  //   type: 'discipline',
  //   effectiveDate: '2021-01-01'
  // },
  // {
  //   file: 'jicd-student-discipline.pdf',
  //   title: 'JICD - Student Discipline and Due Process',
  //   type: 'discipline',
  //   effectiveDate: '2021-01-01'
  // },

  // ============================================================================
  // PRIORITY 5: STUDENT HEALTH & WELFARE
  // ============================================================================

  // {
  //   file: 'jlcd-administering-medication.pdf',
  //   title: 'JLCD - Administering Medication',
  //   type: 'student_health',
  //   effectiveDate: '2018-01-01'
  // },
  // {
  //   file: 'jlcja-sports-injury.pdf',
  //   title: 'JLCJA - Emergency Plans for Sports Related Injury',
  //   type: 'athletic_safety',
  //   effectiveDate: '2021-01-01'
  // },

  // ============================================================================
  // EXAMPLE: Add a test policy to verify the script works
  // ============================================================================

  // Uncomment this to test with an existing file:
  // {
  //   file: 'bullying-prevention-policy.txt',
  //   title: 'DISC-001 - Bullying Prevention Policy (TEST)',
  //   type: 'bullying',
  //   effectiveDate: '2024-01-01'
  // },
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

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠️  SKIPPED: ${policy.title}`);
      console.log(`   File not found: ${policy.file}`);
      skipCount++;
      continue;
    }

    try {
      const form = new FormData();
      form.append('title', policy.title);
      form.append('policyType', policy.type);
      form.append('effectiveDate', policy.effectiveDate);

      // Determine content type
      const ext = policy.file.toLowerCase();
      let contentType = 'text/plain';
      if (ext.endsWith('.pdf')) contentType = 'application/pdf';
      else if (ext.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      form.append('file', fs.readFileSync(filePath), {
        filename: policy.file,
        contentType,
      });

      const response = await fetch('http://localhost:3002/api/policies', {
        method: 'POST',
        body: form as any,
        headers: form.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`\n✅ UPLOADED: ${policy.title}`);
        console.log(`   Type: ${policy.type}`);
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

      // Small delay to avoid overwhelming the server
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

// Run the upload
uploadPolicies().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
