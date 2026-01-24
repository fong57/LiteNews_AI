// scripts/test-perplexity.js
// Test script to verify Perplexity API setup
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online';

async function testPerplexityAPI() {
  console.log('═══════════════════════════════════════');
  console.log('🧪 Perplexity API Test');
  console.log('═══════════════════════════════════════\n');

  // Check if API key is set
  if (!PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY is not set in .env file');
    process.exit(1);
  }

  console.log(`📋 Model: ${PERPLEXITY_MODEL}`);
  console.log(`🔑 API Key: ${PERPLEXITY_API_KEY.substring(0, 10)}...${PERPLEXITY_API_KEY.slice(-4)}`);
  console.log('\n📡 Sending test request...\n');

  try {
    const startTime = Date.now();
    
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: PERPLEXITY_MODEL,
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant. Respond concisely.' 
          },
          { 
            role: 'user', 
            content: 'Respond with exactly: "Perplexity API is working correctly!"' 
          }
        ],
        max_tokens: 50,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const elapsed = Date.now() - startTime;
    const content = response.data.choices[0].message.content;
    const usage = response.data.usage;

    console.log('═══════════════════════════════════════');
    console.log('✅ SUCCESS! Perplexity API is working!');
    console.log('═══════════════════════════════════════\n');
    
    console.log(`📝 Response: "${content}"`);
    console.log(`⏱️  Response time: ${elapsed}ms`);
    
    if (usage) {
      console.log(`📊 Tokens used: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
    }
    
    console.log('\n✅ Your Perplexity setup is ready to use!\n');
    process.exit(0);

  } catch (error) {
    console.log('═══════════════════════════════════════');
    console.error('❌ FAILED! Perplexity API test failed');
    console.log('═══════════════════════════════════════\n');

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`Status: ${status}`);
      console.error(`Error: ${JSON.stringify(data, null, 2)}\n`);
      
      // Helpful error messages
      if (status === 401) {
        console.log('💡 Fix: Your API key is invalid. Check that it starts with "pplx-" and is copied correctly.');
      } else if (status === 402) {
        console.log('💡 Fix: No credits available. Add funds at https://www.perplexity.ai/settings/api');
      } else if (status === 429) {
        console.log('💡 Fix: Rate limited. Wait a moment and try again.');
      } else if (status === 400) {
        console.log('💡 Fix: Invalid request. Check that PERPLEXITY_MODEL is a valid model name.');
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('Error: Cannot connect to Perplexity API');
      console.log('💡 Fix: Check your internet connection.');
    } else {
      console.error(`Error: ${error.message}`);
    }
    
    process.exit(1);
  }
}

testPerplexityAPI();
