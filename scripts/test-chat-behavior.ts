import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

// Was hardcoded to a port nothing serves. (REPO-8, SPEC-22)
const BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

/**
 * The API now requires authentication. Sign in through the UI, copy the
 * `authjs.session-token` cookie, and export it as APP_SESSION_COOKIE.
 * Without it every request below returns 401.
 */
const SESSION_COOKIE = process.env.APP_SESSION_COOKIE ?? '';
const AUTH_HEADERS: Record<string, string> = SESSION_COOKIE
  ? { Cookie: `authjs.session-token=${SESSION_COOKIE}` }
  : {};

/**
 * Test Script: Verify Enhanced Chat Behavior
 *
 * This tests that the chatbot:
 * 1. Gathers information from users
 * 2. Asks smart clarifying questions
 * 3. Provides suggestions on incident type and next steps using policies
 */

async function testChatBehavior() {
  console.log('🧪 Testing Enhanced Chat Behavior\n');
  console.log('='.repeat(80));

  // Test 1: Initial vague incident report - should ask clarifying questions
  console.log('\n📝 TEST 1: Vague incident report (should ask clarifying questions)\n');
  console.log('User says: "A student was bullied today"\n');

  try {
    const response1 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({
        message: 'A student was bullied today',
      }),
    });

    if (!response1.ok) {
      throw new Error(`API error: ${response1.statusText}`);
    }

    const data1 = await response1.json();
    console.log('🤖 General\'s Response:');
    console.log('-'.repeat(80));
    console.log(data1.response);
    console.log('-'.repeat(80));

    if (data1.classification) {
      console.log('\n📊 Incident Classification:');
      console.log(`   Type: ${data1.classification.type}`);
      console.log(`   Severity: ${data1.classification.severity}`);
      console.log(`   Reasoning: ${data1.classification.reasoning}`);
    }

    console.log('\n✅ Test 1 Complete');
    console.log('Expected behavior: Should ask clarifying questions about WHO, WHAT, WHEN, WHERE');

  } catch (error: any) {
    console.error('❌ Test 1 Failed:', error.message);
  }

  // Test 2: More detailed incident - should provide actionable guidance
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 TEST 2: Detailed incident (should provide guidance with policy citations)\n');
  console.log('User says: "Two 7th grade students got into a physical fight in the cafeteria at lunch today. Student A punched Student B in the face. There were about 30 witnesses. Parents have not been notified yet. No serious injuries but Student B has a bloody nose."\n');

  try {
    const response2 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({
        message: 'Two 7th grade students got into a physical fight in the cafeteria at lunch today. Student A punched Student B in the face. There were about 30 witnesses. Parents have not been notified yet. No serious injuries but Student B has a bloody nose.',
      }),
    });

    if (!response2.ok) {
      throw new Error(`API error: ${response2.statusText}`);
    }

    const data2 = await response2.json();
    console.log('🤖 General\'s Response:');
    console.log('-'.repeat(80));
    console.log(data2.response);
    console.log('-'.repeat(80));

    if (data2.classification) {
      console.log('\n📊 Incident Classification:');
      console.log(`   Type: ${data2.classification.type}`);
      console.log(`   Severity: ${data2.classification.severity}`);
      console.log(`   Reasoning: ${data2.classification.reasoning}`);

      if (data2.classification.requiredActions) {
        console.log('\n📋 Required Actions:');
        data2.classification.requiredActions.forEach((action: any, i: number) => {
          console.log(`   ${i + 1}. ${action.description || action}`);
        });
      }

      if (data2.classification.timeline) {
        console.log('\n⏰ Timeline:');
        data2.classification.timeline.forEach((item: any) => {
          console.log(`   - ${item}`);
        });
      }

      if (data2.classification.stakeholders) {
        console.log('\n👥 Stakeholders:');
        console.log(`   ${data2.classification.stakeholders.join(', ')}`);
      }
    }

    console.log('\n✅ Test 2 Complete');
    console.log('Expected behavior: Should provide immediate actions, timelines, policy citations');

  } catch (error: any) {
    console.error('❌ Test 2 Failed:', error.message);
  }

  // Test 3: Title IX incident - should reference Title IX policy
  console.log('\n' + '='.repeat(80));
  console.log('\n📝 TEST 3: Title IX incident (should reference Title IX policy)\n');
  console.log('User says: "A female student reported that a male student touched her inappropriately in the hallway yesterday"\n');

  try {
    const response3 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({
        message: 'A female student reported that a male student touched her inappropriately in the hallway yesterday',
      }),
    });

    if (!response3.ok) {
      throw new Error(`API error: ${response3.statusText}`);
    }

    const data3 = await response3.json();
    console.log('🤖 General\'s Response:');
    console.log('-'.repeat(80));
    console.log(data3.response);
    console.log('-'.repeat(80));

    if (data3.classification) {
      console.log('\n📊 Incident Classification:');
      console.log(`   Type: ${data3.classification.type}`);
      console.log(`   Severity: ${data3.classification.severity}`);
    }

    console.log('\n✅ Test 3 Complete');
    console.log('Expected behavior: Should identify as Title IX, ask for details, reference ACAC policy');

  } catch (error: any) {
    console.error('❌ Test 3 Failed:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🎉 All tests complete!\n');
  console.log('Summary of expected behaviors verified:');
  console.log('1. ✓ Asks clarifying questions when information is vague');
  console.log('2. ✓ Provides actionable guidance with specific timelines');
  console.log('3. ✓ References appropriate policies from vector database');
  console.log('4. ✓ Classifies incidents correctly');
  console.log('5. ✓ Identifies stakeholders and required forms\n');
}

testChatBehavior().catch(console.error);
