import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

/**
 * Upload 2025 Title IX Policy Update
 */

async function uploadTitleIXPolicy() {
  console.log('📄 Uploading 2025 Title IX Policy Update\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const policyPath = resolve(__dirname, '../sample-policies/title-ix-policy-update-2025.txt');

    // Check if file exists
    if (!fs.existsSync(policyPath)) {
      throw new Error(`Policy file not found at: ${policyPath}`);
    }

    console.log('1️⃣  Reading policy file...');
    const fileContent = fs.readFileSync(policyPath);
    const fileStats = fs.statSync(policyPath);

    console.log(`   ✅ File loaded: ${fileStats.size} bytes\n`);

    // Create form data
    console.log('2️⃣  Preparing upload...');
    const form = new FormData();
    form.append('title', '2025 NHSBA Special Title IX Policy Update');
    form.append('policyType', 'title_ix');
    form.append('effectiveDate', '2025-01-09');
    form.append('file', fileContent, {
      filename: 'title-ix-policy-update-2025.txt',
      contentType: 'text/plain',
    });

    console.log('   📋 Title: 2025 NHSBA Special Title IX Policy Update');
    console.log('   📂 Type: title_ix');
    console.log('   📅 Effective Date: 2025-01-09 (Date of 2024 regulations vacatur)\n');

    // Upload to API
    console.log('3️⃣  Uploading to API...');
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
    console.log(`   Active: ${result.policy.isActive}`);
    console.log(`   Created: ${new Date(result.policy.createdAt).toLocaleString()}\n`);

    // Wait a moment for RAG processing
    console.log('5️⃣  Waiting for RAG processing...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('   ✅ Processing complete\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Title IX Policy Upload Complete!\n');
    console.log('💡 Try these test questions:');
    console.log('   - "What are the current Title IX regulations?"');
    console.log('   - "What is the grievance procedure for sexual harassment?"');
    console.log('   - "What Title IX policies need immediate action?"');
    console.log('   - "What are the discrimination and harassment procedures?"\n');
    console.log('📚 This policy covers:');
    console.log('   - 2020 Title IX Regulations (reinstated Jan 2025)');
    console.log('   - Sexual Harassment Policies (ACAC)');
    console.log('   - Discrimination & Harassment Grievance (ACA)');
    console.log('   - Pregnancy Accommodations (GBAM, IHBCA)');
    console.log('   - Gender Identity & Athletics (JJIC)\n');

  } catch (error: any) {
    console.error('\n❌ Upload failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the dev server is running:');
      console.error('   npm run dev\n');
    }

    process.exit(1);
  }
}

uploadTitleIXPolicy();
