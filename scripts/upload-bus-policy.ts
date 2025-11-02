import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

/**
 * Upload School Bus Conduct Policy
 */

async function uploadBusPolicy() {
  console.log('📄 Uploading School Bus Conduct Policy\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const policyPath = resolve(__dirname, '../sample-policies/student-conduct-school-buses.txt');

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
    form.append('title', 'Policy JICC: Student Conduct on School Buses');
    form.append('policyType', 'discipline');
    form.append('effectiveDate', '2024-05-09');
    form.append('file', fileContent, {
      filename: 'student-conduct-school-buses.txt',
      contentType: 'text/plain',
    });

    console.log('   📋 Title: Policy JICC: Student Conduct on School Buses');
    console.log('   📂 Type: discipline');
    console.log('   📅 Effective Date: 2024-05-09\n');

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
    console.log('✅ School Bus Policy Upload Complete!\n');
    console.log('💡 Try these test questions:');
    console.log('   - "Can a student be suspended from the school bus?"');
    console.log('   - "What is the appeal process for bus suspensions?"');
    console.log('   - "How long can a bus suspension last?"');
    console.log('   - "Who has authority over students on the bus?"\n');

  } catch (error: any) {
    console.error('\n❌ Upload failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the dev server is running:');
      console.error('   npm run dev\n');
    }

    process.exit(1);
  }
}

uploadBusPolicy();
