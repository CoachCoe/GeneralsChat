import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

async function testClaude() {
  console.log('🧪 Testing Anthropic Claude API...\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey === 'your-anthropic-api-key-here') {
    console.error('❌ Please replace the placeholder API key in .env');
    process.exit(1);
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    console.log(`📡 Sending test request to ${model}...\n`);

    const message = await client.messages.create({
      model,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: 'You are a school compliance assistant. In one sentence, explain what you do.',
        },
      ],
    });

    console.log('✅ API Key Valid!\n');
    console.log('📝 Claude Response:');
    console.log('─'.repeat(60));
    console.log((message.content[0] as any).text);
    console.log('─'.repeat(60));
    console.log('\n✨ Your Anthropic API is ready to use!');
    console.log('\n💰 Usage:');
    console.log(`   Input tokens: ${message.usage.input_tokens}`);
    console.log(`   Output tokens: ${message.usage.output_tokens}`);
    console.log(`   Estimated cost: $${(message.usage.input_tokens * 0.003 / 1000 + message.usage.output_tokens * 0.015 / 1000).toFixed(4)}`);

  } catch (error: any) {
    console.error('\n❌ API Test Failed:');

    if (error.status === 401) {
      console.error('   Invalid API key. Please check your ANTHROPIC_API_KEY in .env');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded or no credits remaining');
    } else {
      console.error('   Error:', error.message);
    }

    process.exit(1);
  }
}

testClaude();
