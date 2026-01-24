// services/llm/providers/perplexity.js
// Perplexity AI API provider
const axios = require('axios');

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

/**
 * Check if Perplexity is available (API key is set)
 */
async function isAvailable() {
  return Boolean(PERPLEXITY_API_KEY);
}

/**
 * Call Perplexity API
 */
async function callAPI(prompt, systemPrompt = '') {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY not set');
  }

  const response = await axios.post(
    PERPLEXITY_API_URL,
    {
      model: PERPLEXITY_MODEL,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    },
    {
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return response.data.choices[0].message.content.trim();
}

/**
 * Categorize news using Perplexity
 */
async function categorizeNews(newsItem, userCategories) {
  const systemPrompt = 'You are a news categorization assistant. Categorize news articles into exactly one of the provided categories. Return only the category name, nothing else.';

  const prompt = `Categories: ${userCategories.join(', ')}

Title: ${newsItem.title}
Description: ${newsItem.description || 'N/A'}

Return only the category name.`;

  const response = await callAPI(prompt, systemPrompt);
  const category = response.toLowerCase().trim();
  return userCategories.find(c => c.toLowerCase() === category) || userCategories[0] || 'general';
}

/**
 * Group news items into topics using Perplexity
 */
async function groupIntoTopics(newsItems, category) {
  const systemPrompt = 'You are a news analysis assistant. Group related news items into coherent topics. Return valid JSON only, no explanations.';

  const newsList = newsItems
    .map((item, idx) => `${idx + 1}. ${item.title}`)
    .join('\n');

  const prompt = `Group these ${category} news items into topics:

${newsList}

Return a JSON array:
[{"title": "Topic title", "summary": "1-2 sentence summary", "itemIds": [1, 2]}]

Use item numbers as itemIds. Return ONLY valid JSON.`;

  const response = await callAPI(prompt, systemPrompt);

  // Extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from Perplexity');
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
  name: 'perplexity',
  isAvailable,
  categorizeNews,
  groupIntoTopics
};
