import { requireTestDatabase } from './support/require-test-database';
import { config } from 'dotenv';
import { resolve } from 'path';
import { claudeService } from '../src/lib/ai/claude-service';
import { llmService } from '../src/lib/ai/llm-service';
import { incidentClassifier } from '../src/lib/ai/classifier';
import { prisma } from '../src/lib/db';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

/**
 * Phase 3 Integration Test
 *
 * Tests the full Claude AI integration:
 * 1. Claude service direct calls
 * 2. LLM service with compliance prompts
 * 3. Incident classification
 * 4. End-to-end incident handling
 */

async function testPhase3() {
  // Creates and deletes User, Incident and Conversation rows. (B8)
  requireTestDatabase('scripts/test-phase3.ts');

  console.log('🚀 Phase 3: Claude API Integration Test\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  let testUserId: string | undefined;
  let testIncidentId: string | undefined;

  try {
    // ===== TEST 1: Verify API Key =====
    console.log('1️⃣  Verifying Anthropic API Configuration...');

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not found in environment');
    }

    if (process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
      throw new Error('Please add your real Anthropic API key to .env');
    }

    console.log('   ✅ API key configured\n');

    // ===== TEST 2: Create Test User =====
    console.log('2️⃣  Creating test user...');
    const testUser = await prisma.user.create({
      data: {
        email: `test-phase3-${Date.now()}@example.com`,
        name: 'Phase 3 Test Admin',
        role: 'admin',
      },
    });
    testUserId = testUser.id;
    console.log(`   ✅ User created: ${testUser.email}\n`);

    // ===== TEST 3: Test Claude Service Direct Call =====
    console.log('3️⃣  Testing Claude service direct call...');

    const simpleResponse = await claudeService.generateResponse(
      [
        {
          role: 'user',
          content: 'In one sentence, what are the key Title IX reporting requirements for schools?',
        },
      ],
      'You are a school compliance expert.'
    );

    console.log('   ✅ Claude responded successfully');
    console.log(`   📝 Response: "${simpleResponse.content.substring(0, 100)}..."`);
    console.log(`   💰 Tokens: ${simpleResponse.usage.inputTokens} in, ${simpleResponse.usage.outputTokens} out\n`);

    // ===== TEST 4: Test LLM Service =====
    console.log('4️⃣  Testing LLM service with compliance prompt...');

    const llmResponse = await llmService.generateSchoolComplianceResponse(
      'What should I do if a student reports being bullied by another student?'
    );

    console.log('   ✅ LLM service generated response');
    console.log(`   📝 Response preview: "${llmResponse.content.substring(0, 150)}..."`);
    console.log(`   💰 Cost: ~$${((llmResponse.usage?.inputTokens || 0) * 0.003 / 1000 + (llmResponse.usage?.outputTokens || 0) * 0.015 / 1000).toFixed(4)}\n`);

    // ===== TEST 5: Test Incident Classification =====
    console.log('5️⃣  Testing intelligent incident classification...\n');

    const testIncident = `A student reported that another student has been repeatedly pushing them in the hallway,
calling them names, and posting embarrassing photos of them on social media. This has been happening
for the past two weeks. The victim is afraid to come to school.`;

    console.log(`   Incident Description:`);
    console.log(`   "${testIncident.substring(0, 100)}..."\n`);

    const classification = await incidentClassifier.classifyIncident(
      testIncident,
      { reporterId: testUserId }
    );

    console.log('   ✅ Incident classified by Claude');
    console.log(`   📊 Type: ${classification.type}`);
    console.log(`   ⚠️  Severity: ${classification.severity}`);
    console.log(`   👥 Stakeholders: ${classification.stakeholders.join(', ')}`);
    console.log(`   📋 Required Actions: ${classification.requiredActions.length}`);

    if (classification.requiredActions.length > 0) {
      console.log('\n   Required Actions:');
      classification.requiredActions.forEach((action, idx) => {
        console.log(`      ${idx + 1}. ${action.description}`);
        if (action.dueDate) {
          console.log(`         Due: ${action.dueDate.toLocaleDateString()}`);
        }
      });
    }
    console.log('');

    // ===== TEST 6: Create Real Incident in Database =====
    console.log('6️⃣  Creating incident in database...');

    const incident = await prisma.incident.create({
      data: {
        title: 'Bullying Report - Social Media Harassment',
        description: testIncident,
        reporterId: testUserId,
        incidentType: classification.type,
        severity: classification.severity,
        status: 'open',
        metadata: JSON.stringify({
          classification,
          aiGenerated: true,
        }),
      },
    });
    testIncidentId = incident.id;

    console.log(`   ✅ Incident created: ${incident.id}`);
    console.log(`   📋 Type: ${incident.incidentType}, Severity: ${incident.severity}\n`);

    // ===== TEST 7: Test Conversation with Context =====
    console.log('7️⃣  Testing multi-turn conversation...\n');

    const questions = [
      'What immediate steps should I take?',
      'Do I need to contact the parents today?',
      'What documentation is required?',
    ];

    for (const question of questions) {
      console.log(`   ❓ Question: "${question}"`);

      // Save user message
      await prisma.conversation.create({
        data: {
          incidentId: incident.id,
          message: question,
          sender: 'user',
          userId: testUserId,
        },
      });

      // Get conversation history
      const history = await prisma.conversation.findMany({
        where: { incidentId: incident.id },
        orderBy: { timestamp: 'asc' },
      });

      // Generate response with history
      const response = await llmService.generateSchoolComplianceResponse(
        question,
        undefined, // No specific policy context for this test
        history.map(conv => ({
          role: conv.sender as 'user' | 'assistant',
          content: conv.message,
        }))
      );

      // Save assistant response
      await prisma.conversation.create({
        data: {
          incidentId: incident.id,
          message: response.content,
          sender: 'assistant',
        },
      });

      console.log(`   💬 Response: "${response.content.substring(0, 120)}..."\n`);
    }

    // ===== TEST 8: Test Follow-Up Questions =====
    console.log('8️⃣  Testing AI-generated follow-up questions...');

    const followUps = await claudeService.generateFollowUpQuestions(
      testIncident,
      [
        'Reporter: Student',
        'Location: School hallway',
        'Duration: 2 weeks',
      ]
    );

    console.log('   ✅ Generated follow-up questions:');
    followUps.forEach((q, idx) => {
      console.log(`      ${idx + 1}. ${q}`);
    });
    console.log('');

    // ===== TEST 9: Calculate Usage Stats =====
    console.log('9️⃣  Calculating API usage...');

    const conversations = await prisma.conversation.findMany({
      where: { incidentId: incident.id },
    });

    let totalTokens = 0;
    conversations.forEach(conv => {
      if (conv.metadata) {
        try {
          const meta = JSON.parse(conv.metadata);
          if (meta.usage) {
            totalTokens += meta.usage.inputTokens + meta.usage.outputTokens;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });

    console.log(`   ✅ Total messages: ${conversations.length}`);
    console.log(`   💰 Estimated cost: $${(totalTokens * 0.003 / 1000).toFixed(4)}\n`);

    // ===== CLEANUP =====
    console.log('🧹 Cleaning up test data...');

    await prisma.conversation.deleteMany({
      where: { incidentId: testIncidentId },
    });

    await prisma.incident.delete({
      where: { id: testIncidentId },
    });

    await prisma.user.delete({
      where: { id: testUserId },
    });

    console.log('   ✅ Cleanup complete\n');

    // ===== SUCCESS SUMMARY =====
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Phase 3 Integration Test PASSED!\n');
    console.log('Summary:');
    console.log('  ✓ Claude API working');
    console.log('  ✓ LLM service functioning');
    console.log('  ✓ Intelligent incident classification');
    console.log('  ✓ Multi-turn conversations');
    console.log('  ✓ Context-aware responses');
    console.log('  ✓ Follow-up question generation');
    console.log('  ✓ Database integration');
    console.log('\n🎉 Your AI-powered compliance assistant is ready!');
    console.log('\n💡 Next steps:');
    console.log('   - Add some policy documents for RAG');
    console.log('   - Start the dev server: npm run dev');
    console.log('   - Test the chat interface at http://localhost:3000/chat');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);

    if (error.message?.includes('credit balance')) {
      console.error('\n💡 Your Anthropic API credits may be depleted.');
      console.error('   Check: https://console.anthropic.com/settings/billing');
    }

    // Cleanup on error
    try {
      if (testIncidentId) {
        await prisma.conversation.deleteMany({
          where: { incidentId: testIncidentId },
        });
        await prisma.incident.delete({ where: { id: testIncidentId } });
      }
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPhase3();
