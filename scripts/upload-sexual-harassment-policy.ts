import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

/**
 * Upload Sexual Harassment Policy (Title IX)
 */

async function uploadSexualHarassmentPolicy() {
  console.log('📄 Uploading Sexual Harassment Policy (PDF)\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const policyPath = resolve(__dirname, '../sample-policies/sexual-harassment-policy.pdf');

    // Check if file exists
    if (!fs.existsSync(policyPath)) {
      throw new Error(`Policy file not found at: ${policyPath}`);
    }

    console.log('1️⃣  Reading PDF file...');
    const fileContent = fs.readFileSync(policyPath);
    const fileStats = fs.statSync(policyPath);

    console.log(`   ✅ File loaded: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB\n`);

    // Create form data
    console.log('2️⃣  Preparing upload...');
    const form = new FormData();
    form.append('title', 'Policy ACAC: Prohibition of Sexual Harassment Policy and Grievance Procedures');
    form.append('policyType', 'title_ix');
    form.append('effectiveDate', '2024-01-01'); // Adjust if you know the actual date
    form.append('file', fileContent, {
      filename: 'sexual-harassment-policy.pdf',
      contentType: 'application/pdf',
    });

    console.log('   📋 Title: Policy ACAC: Prohibition of Sexual Harassment');
    console.log('   📂 Type: title_ix');
    console.log('   📄 Format: PDF\n');

    // Upload to API
    console.log('3️⃣  Uploading to API (this may take a moment for PDF processing)...');
    const response = await fetch('http://localhost:3001/api/policies', {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('   ✅ Policy uploaded successfully!\n');

    // Display results
    console.log('4️⃣  Policy Details:');
    console.log(`   ID: ${result.policy.id}`);
    console.log(`   Title: ${result.policy.title}`);
    console.log(`   Type: ${result.policy.policyType}`);
    console.log(`   Content Length: ${result.policy.content.length} characters`);
    console.log(`   Active: ${result.policy.isActive}\n`);

    // Wait a moment for RAG processing
    console.log('5️⃣  Processing PDF content and creating chunks...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('   ✅ Processing complete\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Sexual Harassment Policy Upload Complete!\n');
    console.log('💡 Try these test questions:');
    console.log('   - "What is the grievance procedure for sexual harassment?"');
    console.log('   - "Who should I report Title IX violations to?"');
    console.log('   - "What are the timelines for investigating sexual harassment?"');
    console.log('   - "What protections exist for harassment complainants?"\n');

  } catch (error: any) {
    console.error('\n❌ Upload failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the dev server is running:');
      console.error('   npm run dev\n');
    }

    process.exit(1);
  }
}

uploadSexualHarassmentPolicy();
