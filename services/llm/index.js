// services/llm/index.js
// LLM Provider Switch/Router
// Provides a unified interface for different LLM backends

const mockProvider = require('./providers/mock');
const ollamaProvider = require('./providers/ollama');
const perplexityProvider = require('./providers/perplexity');

// LLM_MODE: 'perplexity', 'ollama', or 'mock'
const LLM_MODE = process.env.LLM_MODE || 'mock';

// Provider registry
const providers = {
  mock: mockProvider,
  ollama: ollamaProvider,
  perplexity: perplexityProvider
};

/**
 * Get the active provider based on LLM_MODE
 */
function getProvider() {
  return providers[LLM_MODE] || providers.mock;
}

/**
 * Get the fallback provider (mock)
 */
function getFallbackProvider() {
  return providers.mock;
}

/**
 * Check if the active provider is available
 */
async function isProviderAvailable() {
  const provider = getProvider();
  if (provider.isAvailable) {
    return await provider.isAvailable();
  }
  return true; // Mock is always available
}

/**
 * Categorize a news item
 * Falls back to mock provider on error
 */
async function categorizeNews(newsItem, userCategories) {
  const provider = getProvider();
  const fallback = getFallbackProvider();

  try {
    // Check if provider is available (for Ollama/Perplexity)
    if (provider.isAvailable) {
      const available = await provider.isAvailable();
      if (!available) {
        console.log(`⚠️  ${provider.name} not available, using mock provider`);
        return await fallback.categorizeNews(newsItem, userCategories);
      }
    }

    return await provider.categorizeNews(newsItem, userCategories);
  } catch (error) {
    console.error(`❌ Error with ${provider.name} provider:`, error.message);
    console.log(`↩️  Falling back to mock provider`);
    return await fallback.categorizeNews(newsItem, userCategories);
  }
}

/**
 * Group news items into topics
 * Falls back to mock provider on error
 */
async function groupIntoTopics(newsItems, category) {
  const provider = getProvider();
  const fallback = getFallbackProvider();

  try {
    // Check if provider is available
    if (provider.isAvailable) {
      const available = await provider.isAvailable();
      if (!available) {
        console.log(`⚠️  ${provider.name} not available, using mock provider`);
        return await fallback.groupIntoTopics(newsItems, category);
      }
    }

    return await provider.groupIntoTopics(newsItems, category);
  } catch (error) {
    console.error(`❌ Error with ${provider.name} provider:`, error.message);
    console.log(`↩️  Falling back to mock provider`);
    return await fallback.groupIntoTopics(newsItems, category);
  }
}

/**
 * Get current provider name
 */
function getProviderName() {
  return getProvider().name;
}

/**
 * Get all available provider names
 */
function getAvailableProviders() {
  return Object.keys(providers);
}

// Log active provider on startup
console.log(`🤖 LLM Provider: ${getProviderName()} (LLM_MODE=${LLM_MODE})`);

module.exports = {
  categorizeNews,
  groupIntoTopics,
  getProviderName,
  getAvailableProviders,
  isProviderAvailable
};
