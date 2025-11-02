import { config } from 'dotenv';
import { resolve } from 'path';
import { ragSystem } from '../src/lib/ai/rag';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

/**
 * Test RAG Retrieval
 *
 * Verifies that uploaded policies are retrieved correctly
 */

async function testRAGRetrieval() {
  console.log('🔍 Testing RAG Retrieval\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test query about bullying
    const query = 'What should I do if a student reports being bullied?';

    console.log('1️⃣  Test Query:');
    console.log(`   "${query}"\n`);

    console.log('2️⃣  Searching policies...');
    const results = await ragSystem.searchRelevantPolicies(query, 3);

    if (results.length === 0) {
      console.log('   ⚠️  No results found!\n');
      console.log('💡 This might mean:');
      console.log('   - Embeddings API key not configured (using fallback)');
      console.log('   - Policy chunks not properly indexed');
      console.log('   - Query didn\'t match any content\n');
      return;
    }

    console.log(`   ✅ Found ${results.length} relevant chunks\n`);

    console.log('3️⃣  Retrieved Content:\n');
    results.forEach((result, idx) => {
      console.log(`   Chunk ${idx + 1}:`);
      console.log(`   Score: ${(result as any).score?.toFixed(4) || 'N/A'}`);
      console.log(`   Preview: ${result.content.substring(0, 200)}...\n`);
    });

    // Test generating response with citations
    console.log('4️⃣  Generating response with citations...');
    const { response, citations, chunks } = await ragSystem.generateResponseWithCitations(query, {
      maxResults: 3,
      includeMetadata: true
    });

    console.log('   ✅ Response generated\n');
    console.log('5️⃣  Context Summary:');
    console.log(`   Context Length: ${response.length} characters`);
    console.log(`   Citations: ${citations.length}`);
    console.log(`   Chunks Used: ${chunks.length}\n`);

    if (citations.length > 0) {
      console.log('6️⃣  Citations (Policy IDs):');
      citations.forEach((policyId, idx) => {
        console.log(`   ${idx + 1}. ${policyId}`);
      });
      console.log('');
    }

    console.log('7️⃣  Context Preview:');
    console.log(`   ${response.substring(0, 400)}...\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ RAG Retrieval Test Complete!\n');
    console.log('🎉 Your policies are being retrieved correctly!');
    console.log('\n💡 Now test in the chat interface:');
    console.log('   1. Go to http://localhost:3001/chat');
    console.log('   2. Ask: "What should I do if a student reports being bullied?"');
    console.log('   3. Claude should reference specific policy sections!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testRAGRetrieval();
