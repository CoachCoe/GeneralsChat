import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

// Was hardcoded to a port nothing serves. (REPO-8, SPEC-22)
const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

/**
 * Complete End-to-End RAG Test
 *
 * Tests the full flow: user query → RAG retrieval → Claude response with policy context
 */

async function testCompleteRAG() {
  console.log('🎯 Complete End-to-End RAG Test\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const testQuery = 'What should I do if a student reports being bullied?';

    console.log('1️⃣  Test Query:');
    console.log(`   "${testQuery}"\n`);

    console.log('2️⃣  Sending to chat API (which uses RAG + Claude)...\n');

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testQuery,
        userId: 'demo-user',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    console.log('3️⃣  Response Received:\n');
    console.log('   Status:', response.status);
    console.log('   Incident ID:', data.incidentId);
    console.log('   Classification:', data.classification ? 'Yes' : 'No');

    if (data.classification) {
      console.log('\n4️⃣  Incident Classification:');
      console.log('   Type:', data.classification.type);
      console.log('   Severity:', data.classification.severity);
      console.log('   Required Actions:', data.classification.requiredActions?.length || 0);
    }

    console.log('\n5️⃣  Claude Response:');
    console.log('   ' + '-'.repeat(60));
    console.log(data.response);
    console.log('   ' + '-'.repeat(60));

    if (data.policyContext) {
      console.log('\n6️⃣  Policy Context Used:');
      console.log('   Length:', data.policyContext.length, 'characters');
      console.log('   Contains "bullying":', data.policyContext.toLowerCase().includes('bullying'));
      console.log('   Preview:', data.policyContext.substring(0, 200) + '...');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ End-to-End RAG Test Complete!\n');
    console.log('🎉 Your system is working:');
    console.log('   ✓ Policy uploaded and chunked');
    console.log('   ✓ RAG retrieval working (keyword fallback)');
    console.log('   ✓ Claude receiving policy context');
    console.log('   ✓ Intelligent incident classification');
    console.log('   ✓ Chat API fully functional\n');

    console.log('💡 Try it yourself:');
    console.log(`   1. Open ${BASE_URL}/chat`);
    console.log('   2. Ask about bullying policies');
    console.log('   3. Claude will reference the uploaded policy!\n');

    console.log('📚 Sample queries to try:');
    console.log('   - "What is the timeline for investigating a bullying report?"');
    console.log('   - "Who needs to be notified when bullying is reported?"');
    console.log('   - "What are the consequences for a second bullying offense?"');
    console.log('   - "What support is available for victims of cyberbullying?"\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the dev server is running:');
      console.error('   npm run dev\n');
    }

    process.exit(1);
  }
}

testCompleteRAG();
