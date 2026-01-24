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
  const systemPrompt = 'You are a news analysis assistant. Group related news items into coherent topics. All output (title, summary, tags) MUST be in Traditional Chinese (繁體中文). Translate from the original language if necessary. Return valid JSON only, no explanations.';

  const newsList = newsItems
    .map((item, idx) => `${idx + 1}. ${item.title}`)
    .join('\n');

  const prompt = `Group these ${category} news items into topics:

${newsList}

IMPORTANT: All output MUST be in Traditional Chinese (繁體中文). Translate if necessary.

Return a JSON array:
[{"title": "主題標題", "summary": "1-2句摘要", "itemIds": [1, 2], "tags": ["標籤1", "標籤2", "標籤3", "標籤4", "標籤5"]}]

TAG RULES (STRICT):
- Each tag MUST be a SHORT NOUN only (Chinese characters, or short proper nouns for names/brands)
- NO phrases, NO sentences, NO verbs, NO adjectives alone
- Good examples: "科技", "蘋果", "馬斯克", "AI", "股市", "併購", "OpenAI", "台積電"
- Bad examples: "科技發展趨勢", "蘋果公司發布新產品", "市場表現良好"

Generate exactly 5 short noun tags per topic describing key themes, people, companies, or technologies.

Use item numbers as itemIds. Return ONLY valid JSON.`;

  const response = await callAPI(prompt, systemPrompt);

  // Extract JSON from response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from Perplexity');
  }

  const topics = JSON.parse(jsonMatch[0]);

  // Convert indices to actual IDs and normalize tags
  // Also filter out tags that are too long (likely phrases/sentences)
  const MAX_TAG_LENGTH = 15; // Allow up to 15 chars for proper nouns like "OpenAI" or "台積電"
  
  return topics.map(topic => ({
    title: topic.title,
    summary: topic.summary,
    itemIds: topic.itemIds
      .map(idx => newsItems[parseInt(idx) - 1]?._id?.toString())
      .filter(Boolean),
    tags: (topic.tags || [])
      .slice(0, 5)
      .map(tag => String(tag).toLowerCase().trim())
      .filter(tag => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
  }));
}

/**
 * Categorize a topic using Perplexity (NEW - topic-level categorization)
 * @param {Object} topicMetadata - Topic with title, summary
 * @param {Array} categories - Available categories
 * @returns {Promise<string>} - Category name
 */
async function categorizeTopic(topicMetadata, categories) {
  const systemPrompt = 'You are a news categorization assistant. Categorize topics into exactly one of the provided categories. Return only the category name, nothing else.';

  const prompt = `Categories: ${categories.join(', ')}

Topic Title: ${topicMetadata.title}
Topic Summary: ${topicMetadata.summary || 'N/A'}

Based on the topic's content, return only the most appropriate category name.`;

  const response = await callAPI(prompt, systemPrompt);
  const category = response.toLowerCase().trim();
  return categories.find(c => c.toLowerCase() === category) || categories[0] || 'general';
}

/**
 * Generate topic metadata from a cluster of news items using Perplexity (NEW)
 * @param {Array} newsItems - Array of news items in the cluster
 * @returns {Promise<Object>} - { title, summary, tags }
 */
async function generateTopicMetadata(newsItems) {
  if (!newsItems || newsItems.length === 0) {
    throw new Error('No news items provided');
  }

  const systemPrompt = 'You are a news analysis assistant. Generate topic metadata in Traditional Chinese (繁體中文). Return valid JSON only, no explanations.';

  const newsList = newsItems
    .map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description || 'No description'}`)
    .join('\n');

  const prompt = `Generate a unified topic title, summary, and tags for these related news items:

${newsList}

IMPORTANT: All output MUST be in Traditional Chinese (繁體中文). Translate if necessary.

Return a JSON object:
{
  "title": "主題標題（簡潔，最多60字）",
  "summary": "1-2句摘要說明這個主題的核心內容",
  "tags": ["標籤1", "標籤2", "標籤3", "標籤4", "標籤5"]
}

TAG RULES (STRICT):
- Each tag MUST be a SHORT NOUN only
- NO phrases, NO sentences, NO verbs
- Good examples: "科技", "蘋果", "馬斯克", "AI", "股市"
- Generate exactly 5 short noun tags

Return ONLY valid JSON.`;

  const response = await callAPI(prompt, systemPrompt);

  // Extract JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from Perplexity');
  }

  const metadata = JSON.parse(jsonMatch[0]);
  const MAX_TAG_LENGTH = 15;

  return {
    title: metadata.title || newsItems[0].title,
    summary: metadata.summary || newsItems[0].description || metadata.title,
    tags: (metadata.tags || [])
      .slice(0, 5)
      .map(tag => String(tag).toLowerCase().trim())
      .filter(tag => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
  };
}

module.exports = {
  name: 'perplexity',
  isAvailable,
  categorizeNews,
  groupIntoTopics,
  categorizeTopic,
  generateTopicMetadata
};
