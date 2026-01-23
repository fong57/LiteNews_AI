// services/llmService.js - Ollama with mock mode
const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const USE_MOCK = process.env.USE_MOCK_LLM === 'true' || false;

// Check if Ollama is available
async function checkOllamaAvailable() {
  if (USE_MOCK) return false;
  
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 2000 });
    return response.status === 200;
  } catch (error) {
    console.log('⚠️  Ollama not available, using mock mode');
    return false;
  }
}

// Mock LLM responses for testing without Ollama
const mockLLM = {
  categorize: async (newsItem, userCategories) => {
    // Simple keyword-based categorization for mock mode
    const title = (newsItem.title || '').toLowerCase();
    const desc = (newsItem.description || '').toLowerCase();
    const text = title + ' ' + desc;
    
    // Simple keyword matching
    if (userCategories.includes('politics') && (text.includes('election') || text.includes('president') || text.includes('government'))) {
      return 'politics';
    }
    if (userCategories.includes('sports') && (text.includes('game') || text.includes('match') || text.includes('team') || text.includes('player'))) {
      return 'sports';
    }
    if (userCategories.includes('technology') && (text.includes('tech') || text.includes('ai') || text.includes('software') || text.includes('app'))) {
      return 'technology';
    }
    if (userCategories.includes('business') && (text.includes('market') || text.includes('stock') || text.includes('company') || text.includes('business'))) {
      return 'business';
    }
    
    // Default to first category or 'general'
    return userCategories[0] || 'general';
  },
  
  groupTopics: async (newsItems, category) => {
    // Simple grouping by title similarity for mock mode
    const topics = [];
    const processed = new Set();
    
    for (let i = 0; i < newsItems.length; i++) {
      if (processed.has(i)) continue;
      
      const item = newsItems[i];
      const titleWords = item.title.toLowerCase().split(/\s+/).slice(0, 3);
      
      const relatedItems = [item._id.toString()];
      processed.add(i);
      
      // Find similar items
      for (let j = i + 1; j < newsItems.length; j++) {
        if (processed.has(j)) continue;
        const otherTitle = newsItems[j].title.toLowerCase();
        const hasCommonWords = titleWords.some(word => word.length > 3 && otherTitle.includes(word));
        
        if (hasCommonWords) {
          relatedItems.push(newsItems[j]._id.toString());
          processed.add(j);
        }
      }
      
      if (relatedItems.length > 0) {
        topics.push({
          title: item.title.substring(0, 60) + (item.title.length > 60 ? '...' : ''),
          summary: item.description || item.title,
          itemIds: relatedItems
        });
      }
    }
    
    // Limit to 5 topics per category
    return topics.slice(0, 5);
  }
};

// Real Ollama LLM calls
async function callOllama(prompt, systemPrompt = '') {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
      stream: false,
      options: {
        temperature: 0.3
      }
    }, {
      timeout: 30000
    });
    
    return response.data.response.trim();
  } catch (error) {
    console.error('Ollama API error:', error.message);
    throw error;
  }
}

// Categorize news item
async function categorizeNews(newsItem, userCategories) {
  const ollamaAvailable = await checkOllamaAvailable();
  
  if (!ollamaAvailable) {
    return await mockLLM.categorize(newsItem, userCategories);
  }
  
  const prompt = `Categorize this news into one of these categories: ${userCategories.join(', ')}

Title: ${newsItem.title}
Description: ${newsItem.description || 'N/A'}

Return only the category name, nothing else.`;
  
  try {
    const response = await callOllama(prompt);
    // Extract category from response
    const category = response.toLowerCase().trim();
    return userCategories.find(c => c.toLowerCase() === category) || userCategories[0] || 'general';
  } catch (error) {
    console.error('Error categorizing with Ollama, falling back to mock:', error.message);
    return await mockLLM.categorize(newsItem, userCategories);
  }
}

// Group news items into topics
async function groupIntoTopics(newsItems, category) {
  const ollamaAvailable = await checkOllamaAvailable();
  
  if (!ollamaAvailable) {
    return await mockLLM.groupTopics(newsItems, category);
  }
  
  const newsList = newsItems.map((item, idx) => 
    `${idx + 1}. ${item.title} - ${item.description || 'No description'}`
  ).join('\n');
  
  const prompt = `Group these news items into topics. Each topic should have a clear theme and include related items.

News items:
${newsList}

Return a JSON array with this structure:
[
  {
    "title": "Topic title",
    "summary": "Brief summary",
    "itemIds": ["item_index_1", "item_index_2", ...]
  }
]

Use the item indices (1, 2, 3...) as itemIds. Return only valid JSON, no other text.`;
  
  try {
    const response = await callOllama(prompt);
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const topics = JSON.parse(jsonMatch[0]);
      // Convert indices to actual IDs
      return topics.map(topic => ({
        title: topic.title,
        summary: topic.summary,
        itemIds: topic.itemIds.map(idx => newsItems[parseInt(idx) - 1]._id.toString())
      }));
    }
    throw new Error('Invalid JSON response');
  } catch (error) {
    console.error('Error grouping with Ollama, falling back to mock:', error.message);
    return await mockLLM.groupTopics(newsItems, category);
  }
}

module.exports = {
  categorizeNews,
  groupIntoTopics,
  checkOllamaAvailable
};
