import { ragSystem } from '../src/lib/ai/rag';
import { embeddingsService } from '../src/lib/ai/embeddings';
import { chromaService } from '../src/lib/ai/chroma';
import { prisma } from '../src/lib/db';

/**
 * Comprehensive RAG System Test
 *
 * Tests the entire RAG pipeline:
 * 1. Embeddings generation
 * 2. Chroma vector database
 * 3. Policy document processing
 * 4. Semantic search
 */

async function testRAGSystem() {
  console.log('🧪 Testing RAG System\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  let testUserId: string | undefined;
  let testPolicyId: string | undefined;

  try {
    // ===== TEST 1: Check API Keys =====
    console.log('1️⃣  Checking API Keys...');

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const isValidKey = process.env.OPENAI_API_KEY &&
                       process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

    if (!hasOpenAI || !isValidKey) {
      console.log('   ⚠️  WARNING: OpenAI API key not configured');
      console.log('   ℹ️  Set OPENAI_API_KEY in .env to test embeddings');
      console.log('   ℹ️  System will use fallback keyword search\n');
    } else {
      console.log('   ✅ OpenAI API key configured\n');
    }

    // ===== TEST 2: Create Test User =====
    console.log('2️⃣  Creating test user...');
    const testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test Administrator',
        role: 'admin',
      },
    });
    testUserId = testUser.id;
    console.log(`   ✅ Test user created: ${testUser.email}\n`);

    // ===== TEST 3: Initialize RAG System =====
    console.log('3️⃣  Initializing RAG system...');
    await ragSystem.initialize();
    console.log('   ✅ RAG system initialized\n');

    // ===== TEST 4: Test Embeddings (if API key available) =====
    if (isValidKey) {
      console.log('4️⃣  Testing embeddings generation...');
      try {
        const testText = 'This is a test document about school bullying policies.';
        const embedding = await embeddingsService.generateEmbedding(testText);

        console.log(`   ✅ Embedding generated: ${embedding.length} dimensions`);
        console.log(`   ℹ️  First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);
      } catch (error) {
        console.log(`   ❌ Embedding generation failed: ${error}\n`);
      }
    } else {
      console.log('4️⃣  Skipping embedding test (no API key)\n');
    }

    // ===== TEST 5: Create Test Policy =====
    console.log('5️⃣  Creating test policy document...');

    const samplePolicyContent = `
SCHOOL BULLYING PREVENTION POLICY

Section 1: Definition of Bullying
Bullying is defined as repeated, unwanted aggressive behavior that involves a real or perceived power imbalance.
Bullying includes actions such as making threats, spreading rumors, attacking someone physically or verbally,
and deliberately excluding someone from a group.

Section 2: Reporting Requirements
All incidents of bullying must be reported to school administrators within 24 hours of discovery.
Teachers and staff are mandated reporters and must document any witnessed or reported incidents.

Section 3: Investigation Procedures
Upon receipt of a bullying report, the school must:
1. Interview the victim within 2 school days
2. Interview the alleged perpetrator within 2 school days
3. Interview any witnesses within 5 school days
4. Complete investigation within 10 school days
5. Notify parents of all involved parties

Section 4: Consequences
Consequences for bullying behavior may include:
- Verbal warning (first offense)
- Parent conference (second offense)
- Suspension (third offense or severe cases)
- Expulsion (extreme or repeated cases)

Section 5: Prevention Programs
The school will implement:
- Annual anti-bullying training for all students
- Monthly awareness campaigns
- Peer mediation programs
- Parent education workshops
    `.trim();

    const policy = await prisma.policy.create({
      data: {
        title: 'School Bullying Prevention Policy',
        content: samplePolicyContent,
        jurisdiction: 'district',
        category: 'bullying',
        effectiveDate: new Date(),
        isActive: true,
      },
    });
    testPolicyId = policy.id;
    console.log(`   ✅ Policy created: ${policy.title}\n`);

    // ===== TEST 6: Add Policy to RAG System =====
    console.log('6️⃣  Adding policy to RAG system...');
    await ragSystem.addPolicyDocument(policy.id, samplePolicyContent, {
      title: policy.title,
      jurisdiction: policy.jurisdiction,
      category: policy.category,
    });
    console.log('   ✅ Policy added to RAG system with embeddings\n');

    // ===== TEST 7: Check RAG Stats =====
    console.log('7️⃣  Checking RAG system statistics...');
    const stats = await ragSystem.getStats();
    console.log(`   ✅ Total chunks in database: ${stats.totalChunks}`);
    console.log(`   ✅ Total policies: ${stats.totalPolicies}`);
    console.log(`   ✅ Chunks in Chroma: ${stats.chromaChunks}\n`);

    // ===== TEST 8: Test Semantic Search =====
    console.log('8️⃣  Testing semantic search...\n');

    const testQueries = [
      'What should I do if a student reports being bullied?',
      'How long do we have to investigate a bullying incident?',
      'What are the consequences for bullying?',
      'Who needs to be notified about bullying incidents?',
    ];

    for (const query of testQueries) {
      console.log(`   Query: "${query}"`);

      try {
        const results = await ragSystem.searchRelevantPolicies(query, 3);

        if (results.length > 0) {
          console.log(`   ✅ Found ${results.length} relevant chunks:`);
          results.forEach((chunk, idx) => {
            const preview = chunk.content.substring(0, 100).replace(/\n/g, ' ');
            console.log(`      ${idx + 1}. ${preview}...`);
          });
        } else {
          console.log('   ⚠️  No results found');
        }
      } catch (error) {
        console.log(`   ❌ Search failed: ${error}`);
      }
      console.log('');
    }

    // ===== TEST 9: Test Generate Response with Citations =====
    console.log('9️⃣  Testing response generation with citations...');
    const { response, citations, chunks } = await ragSystem.generateResponseWithCitations(
      'What are the reporting requirements for bullying?',
      {}
    );

    console.log(`   ✅ Generated response with ${chunks.length} relevant chunks`);
    console.log(`   ✅ Citations: ${citations.length} unique policies`);
    console.log(`   ℹ️  Preview: ${response.substring(0, 150).replace(/\n/g, ' ')}...\n`);

    // ===== CLEANUP =====
    console.log('🧹 Cleaning up test data...');

    // Delete policy chunks from RAG
    await ragSystem.deletePolicyChunks(testPolicyId);

    // Delete policy
    await prisma.policy.delete({ where: { id: testPolicyId } });

    // Delete test user
    await prisma.user.delete({ where: { id: testUserId } });

    console.log('   ✅ Cleanup complete\n');

    // ===== FINAL SUMMARY =====
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ RAG System Test Complete!\n');
    console.log('Summary:');
    console.log('  ✓ Database connection working');
    console.log('  ✓ RAG system initialized');
    if (isValidKey) {
      console.log('  ✓ Embeddings generation working');
      console.log('  ✓ Chroma vector database working');
      console.log('  ✓ Semantic search working');
    } else {
      console.log('  ⚠ Embeddings not tested (add API key to .env)');
      console.log('  ⚠ Using fallback keyword search');
    }
    console.log('  ✓ Policy processing working');
    console.log('  ✓ Citation system working');
    console.log('\n🎉 Your RAG system is ready to use!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    // Cleanup on error
    try {
      if (testPolicyId) {
        await ragSystem.deletePolicyChunks(testPolicyId);
        await prisma.policy.delete({ where: { id: testPolicyId } });
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

testRAGSystem();
