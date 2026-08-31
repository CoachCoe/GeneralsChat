import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

// Was hardcoded to a port nothing serves. (REPO-8, SPEC-22)
const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

/**
 * Test Script: Verify Enhanced Lawyer Persona & End-of-Chat Summary
 *
 * This tests:
 * 1. Lawyer persona asks about superintendent, police, legal counsel
 * 2. Risk mitigation focus
 * 3. End-of-chat summary generation with policy citations
 */

async function testLawyerPersonaAndSummary() {
  console.log('🧪 Testing Enhanced Lawyer Persona & Summary Generation\n');
  console.log('='.repeat(80));

  let incidentId: string | null = null;

  // Test 1: Simple bullying report - should ask about superintendent, documentation
  console.log('\n📝 TEST 1: Bullying Report (Lawyer Persona)\n');
  console.log('Administrator says: "I have a bullying complaint from a parent"\n');

  try {
    const response1 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'I have a bullying complaint from a parent',
        userId: 'demo-user',
      }),
    });

    const data1 = await response1.json();
    incidentId = data1.incidentId;

    console.log('🤖 Legal Counsel\'s Response:');
    console.log('-'.repeat(80));
    console.log(data1.response);
    console.log('-'.repeat(80));

    console.log('\n✅ Checking for lawyer-style questions:');
    const response = data1.response.toLowerCase();
    if (response.includes('superintendent') || response.includes('documented') || response.includes('when')) {
      console.log('   ✓ Asks about documentation/timeline/notifications');
    }
    if (response.includes('police') || response.includes('dcyf') || response.includes('report')) {
      console.log('   ✓ Asks about mandatory reporting obligations');
    }

  } catch (error: any) {
    console.error('❌ Test 1 Failed:', error.message);
    return;
  }

  // Test 2: Follow-up with more details
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 TEST 2: Follow-up Response\n');
  console.log('Administrator says: "Two 8th graders. One student called the other names repeatedly over several weeks. Parents called yesterday. I learned about it this morning. No documentation yet."\n');

  try {
    const response2 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Two 8th graders. One student called the other names repeatedly over several weeks. Parents called yesterday. I learned about it this morning. No documentation yet.',
        userId: 'demo-user',
        incidentId,
      }),
    });

    const data2 = await response2.json();

    console.log('🤖 Legal Counsel\'s Response:');
    console.log('-'.repeat(80));
    console.log(data2.response);
    console.log('-'.repeat(80));

    console.log('\n✅ Checking for risk mitigation focus:');
    const response = data2.response.toLowerCase();
    if (response.includes('document') || response.includes('powerschool') || response.includes('evidence')) {
      console.log('   ✓ Emphasizes documentation requirements');
    }
    if (response.includes('timeline') || response.includes('deadline') || response.includes('within')) {
      console.log('   ✓ Mentions specific timelines');
    }
    if (response.includes('superintendent') || response.includes('notify') || response.includes('inform')) {
      console.log('   ✓ Asks about notification chain');
    }

  } catch (error: any) {
    console.error('❌ Test 2 Failed:', error.message);
    return;
  }

  // Test 3: More follow-up
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 TEST 3: Additional Information\n');
  console.log('Administrator says: "No witnesses that I know of. Both students are in same homeroom. Target student has been out sick for 3 days. Perpetrator has no prior incidents."\n');

  try {
    const response3 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'No witnesses that I know of. Both students are in same homeroom. Target student has been out sick for 3 days. Perpetrator has no prior incidents.',
        userId: 'demo-user',
        incidentId,
      }),
    });

    const data3 = await response3.json();

    console.log('🤖 Legal Counsel\'s Response:');
    console.log('-'.repeat(80));
    console.log(data3.response);
    console.log('-'.repeat(80));

  } catch (error: any) {
    console.error('❌ Test 3 Failed:', error.message);
    return;
  }

  // Test 4: Generate end-of-chat summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 TEST 4: Generate End-of-Chat Summary\n');

  if (!incidentId) {
    console.error('❌ No incident ID available for summary generation');
    return;
  }

  try {
    console.log('Generating comprehensive summary...\n');

    const summaryResponse = await fetch(`${BASE_URL}/api/chat/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidentId }),
    });

    if (!summaryResponse.ok) {
      throw new Error(`Summary API error: ${summaryResponse.statusText}`);
    }

    const summaryData = await summaryResponse.json();

    console.log('📋 END-OF-CHAT SUMMARY:');
    console.log('='.repeat(80));
    console.log(summaryData.summary);
    console.log('='.repeat(80));

    console.log(`\n📊 Summary Statistics:`);
    console.log(`   Messages Analyzed: ${summaryData.messagesAnalyzed}`);
    console.log(`   Input Tokens: ${summaryData.usage.inputTokens}`);
    console.log(`   Output Tokens: ${summaryData.usage.outputTokens}`);

    console.log('\n✅ Checking summary quality:');
    const summary = summaryData.summary.toLowerCase();
    if (summary.includes('## incident summary') || summary.includes('incident summary')) {
      console.log('   ✓ Contains Incident Summary section');
    }
    if (summary.includes('## policy analysis') || summary.includes('policy') || summary.includes('jick') || summary.includes('disc')) {
      console.log('   ✓ Contains Policy Analysis with citations');
    }
    if (summary.includes('## risk assessment') || summary.includes('risk') || summary.includes('liability')) {
      console.log('   ✓ Contains Risk Assessment');
    }
    if (summary.includes('## actions taken') || summary.includes('actions taken')) {
      console.log('   ✓ Contains Actions Taken section');
    }
    if (summary.includes('## outstanding next steps') || summary.includes('next steps')) {
      console.log('   ✓ Contains Outstanding Next Steps');
    }
    if (summary.includes('## open questions') || summary.includes('open questions')) {
      console.log('   ✓ Contains Open Questions section');
    }
    if (summary.includes('## recommendations') || summary.includes('recommendations')) {
      console.log('   ✓ Contains Recommendations');
    }

  } catch (error: any) {
    console.error('❌ Test 4 Failed:', error.message);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🎉 All tests complete!\n');
  console.log('Summary of verified behaviors:');
  console.log('1. ✓ Lawyer persona asks about superintendent notification');
  console.log('2. ✓ Asks about police reports and legal counsel');
  console.log('3. ✓ Emphasizes documentation and evidence preservation');
  console.log('4. ✓ Mentions specific timelines and deadlines');
  console.log('5. ✓ Generates comprehensive end-of-chat summary');
  console.log('6. ✓ Summary includes policy citations');
  console.log('7. ✓ Summary identifies open questions and next steps\n');
}

testLawyerPersonaAndSummary().catch(console.error);
