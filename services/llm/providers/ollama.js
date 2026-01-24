// services/llm/providers/ollama.js
// Local Ollama LLM provider
const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

/**
 * Check if Ollama is available
 */
async function isAvailable() {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 2000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Call Ollama API
 */
async function callAPI(prompt, systemPrompt = '') {
  const response = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
      stream: false,
      options: {
        temperature: 0.3
      }
    },
    { timeout: 30000 }
  );

  return response.data.response.trim();
}

/**
 * Categorize news using Ollama
 */
async function categorizeNews(newsItem, userCategories) {
  const prompt = `Categorize this news into one of these categories: ${userCategories.join(', ')}

Title: ${newsItem.title}
Description: ${newsItem.description || 'N/A'}

Return only the category name, nothing else.`;

  const response = await callAPI(prompt);
  const category = response.toLowerCase().trim();
  return userCategories.find(c => c.toLowerCase() === category) || userCategories[0] || 'general';
}

/**
 * Group news items into topics using Ollama
 */
async function groupIntoTopics(newsItems, category) {
  const newsList = newsItems
    .map((item, idx) => `${idx + 1}. ${item.title} - ${item.description || 'No description'}`)
    .join('\n');

  const prompt = `Group these news items into topics. Each topic should have a clear theme and include related items.

News items:
${newsList}

Return a JSON array with this structure:
[
  {
    "title": "Topic title",
    "summary": "Brief summary",
    "itemIds": [1, 2, 3]
  }
]

Use the item numbers (1, 2, 3...) as itemIds. Return only valid JSON, no other text.`;

  const response = await callAPI(prompt);

  // Extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from Ollama');
  }

  const topics = JSON.parse(jsonMatch[0]);

  // Convert indices to actual IDs
  return topics.map(topic => ({
    title: topic.title,
    summary: topic.summary,
    itemIds: topic.itemIds
      .map(idx => newsItems[parseInt(idx) - 1]?._id?.toString())
      .filter(Boolean)
  }));
}

module.exports = {
  name: 'ollama',
  isAvailable,
  categorizeNews,
  groupIntoTopics
};
