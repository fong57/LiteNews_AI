// services/llm/providers/mock.js
// Simple keyword-based categorization and grouping for testing without an LLM

/**
 * Categorize news using keyword matching
 */
async function categorizeNews(newsItem, userCategories) {
  const title = (newsItem.title || '').toLowerCase();
  const desc = (newsItem.description || '').toLowerCase();
  const text = title + ' ' + desc;

  // Keyword mappings for common categories
  const categoryKeywords = {
    politics: ['election', 'president', 'government', 'senate', 'congress', 'minister', 'vote', 'policy', 'democrat', 'republican'],
    sports: ['game', 'match', 'team', 'player', 'score', 'championship', 'league', 'tournament', 'win', 'coach'],
    technology: ['tech', 'ai', 'software', 'app', 'google', 'apple', 'microsoft', 'startup', 'digital', 'computer', 'robot'],
    business: ['market', 'stock', 'company', 'business', 'ceo', 'profit', 'revenue', 'investment', 'trade', 'economy'],
    entertainment: ['movie', 'film', 'music', 'celebrity', 'actor', 'singer', 'concert', 'album', 'tv', 'show'],
    science: ['research', 'study', 'scientist', 'discovery', 'space', 'nasa', 'climate', 'medical', 'health'],
    world: ['international', 'global', 'country', 'nation', 'foreign', 'diplomacy', 'war', 'peace']
  };

  // Check each user category for keyword matches
  for (const category of userCategories) {
    const keywords = categoryKeywords[category.toLowerCase()] || [];
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }

  // Default to first category or 'general'
  return userCategories[0] || 'general';
}

/**
 * Extract tags from text using keyword matching (Traditional Chinese output)
 */
function extractMockTags(items, category) {
  const allText = items
    .map(item => `${item.title} ${item.description || ''}`)
    .join(' ')
    .toLowerCase();

  // Keyword to Traditional Chinese tag mapping
  const keywordToChineseTag = {
    // Companies/Organizations
    'google': '谷歌',
    'apple': '蘋果公司',
    'microsoft': '微軟',
    'amazon': '亞馬遜',
    'meta': 'Meta',
    'facebook': '臉書',
    'tesla': '特斯拉',
    'nvidia': '輝達',
    'openai': 'OpenAI',
    'netflix': 'Netflix',
    'disney': '迪士尼',
    'twitter': '推特',
    'x corp': 'X',
    'spacex': 'SpaceX',
    'nasa': 'NASA',
    'fbi': 'FBI',
    'cia': 'CIA',
    'nfl': 'NFL',
    'nba': 'NBA',
    'mlb': 'MLB',
    // People
    'elon musk': '馬斯克',
    'trump': '川普',
    'biden': '拜登',
    'tim cook': '庫克',
    'zuckerberg': '祖克柏',
    'bezos': '貝佐斯',
    'gates': '蓋茲',
    'messi': '梅西',
    'ronaldo': '乌納度',
    'taylor swift': '乌霉',
    // Technologies
    'ai': '人工智慧',
    'artificial intelligence': '人工智慧',
    'machine learning': '機器學習',
    'blockchain': '區塊鏈',
    'crypto': '加密貨幣',
    'bitcoin': '比特幣',
    'ethereum': '以太坊',
    'chatgpt': 'ChatGPT',
    'gpt': 'GPT',
    'cloud': '雲端',
    '5g': '5G',
    'ev': '電動車',
    'electric vehicle': '電動車',
    'quantum': '量子',
    // Topics
    'climate': '氣候',
    'privacy': '隱私',
    'security': '資安',
    'healthcare': '醫療',
    'education': '教育',
    'inflation': '通膨',
    'recession': '經濟衰退',
    'layoffs': '裁員',
    'ipo': 'IPO',
    'merger': '併購',
    'acquisition': '收購',
    'regulation': '監管',
    'antitrust': '反壟斷'
  };

  // Category to Chinese mapping
  const categoryToChinese = {
    'politics': '政治',
    'sports': '體育',
    'technology': '科技',
    'business': '商業',
    'entertainment': '娛樂',
    'science': '科學',
    'world': '國際',
    'general': '綜合'
  };

  const foundTags = new Set();
  
  // Add category as a tag (in Chinese)
  const chineseCategory = categoryToChinese[category.toLowerCase()] || category;
  foundTags.add(chineseCategory);

  // Search for keywords in text and add Chinese tags
  for (const [keyword, chineseTag] of Object.entries(keywordToChineseTag)) {
    if (allText.includes(keyword)) {
      foundTags.add(chineseTag);
    }
  }

  // If we don't have enough tags, extract significant words from titles
  if (foundTags.size < 5) {
    const titleWords = items
      .flatMap(item => item.title.toLowerCase().split(/\s+/))
      .filter(word => word.length > 4 && !['about', 'after', 'before', 'their', 'there', 'these', 'those', 'would', 'could', 'should', 'which', 'where', 'while'].includes(word));

    const wordCounts = {};
    for (const word of titleWords) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    const commonWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5 - foundTags.size)
      .map(([word]) => word);

    for (const word of commonWords) {
      foundTags.add(word);
    }
  }

  // Return up to 5 tags
  return Array.from(foundTags).slice(0, 5);
}

/**
 * Group news items into topics using title similarity
 */
async function groupIntoTopics(newsItems, category) {
  const topics = [];
  const processed = new Set();

  for (let i = 0; i < newsItems.length; i++) {
    if (processed.has(i)) continue;

    const item = newsItems[i];
    // Extract significant words from title (longer than 3 chars)
    const titleWords = item.title
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);

    const relatedItems = [item._id.toString()];
    const groupedItems = [item];
    processed.add(i);

    // Find similar items by checking for common words
    for (let j = i + 1; j < newsItems.length; j++) {
      if (processed.has(j)) continue;
      
      const otherTitle = newsItems[j].title.toLowerCase();
      const hasCommonWords = titleWords.some(word => otherTitle.includes(word));

      if (hasCommonWords) {
        relatedItems.push(newsItems[j]._id.toString());
        groupedItems.push(newsItems[j]);
        processed.add(j);
      }
    }

    if (relatedItems.length > 0) {
      topics.push({
        title: item.title.substring(0, 60) + (item.title.length > 60 ? '...' : ''),
        summary: item.description || item.title,
        itemIds: relatedItems,
        tags: extractMockTags(groupedItems, category)
      });
    }
  }

  // Limit to 5 topics per category
  return topics.slice(0, 5);
}

/**
 * Categorize a topic using keyword matching (NEW)
 * @param {Object} topicMetadata - Topic with title, summary
 * @param {Array} categories - Available categories
 * @returns {Promise<string>} - Category name
 */
async function categorizeTopic(topicMetadata, categories) {
  // Reuse the news categorization logic for topics
  return categorizeNews(
    { title: topicMetadata.title, description: topicMetadata.summary },
    categories
  );
}

/**
 * Generate topic metadata from a cluster of news items (NEW)
 * @param {Array} newsItems - Array of news items in the cluster
 * @returns {Promise<Object>} - { title, summary, tags }
 */
async function generateTopicMetadata(newsItems) {
  if (!newsItems || newsItems.length === 0) {
    throw new Error('No news items provided');
  }

  // Use the most recent item's title as the topic title
  const sortedItems = [...newsItems].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
  const primaryItem = sortedItems[0];

  // Generate title from the primary item
  const title = primaryItem.title.length > 80
    ? primaryItem.title.substring(0, 77) + '...'
    : primaryItem.title;

  // Generate summary from the primary item's description or title
  const summary = primaryItem.description || primaryItem.title;

  // Extract tags using the existing mock tag extraction
  const tags = extractMockTags(newsItems, 'general');

  return {
    title,
    summary,
    tags
  };
}

module.exports = {
  name: 'mock',
  categorizeNews,
  groupIntoTopics,
  categorizeTopic,
  generateTopicMetadata
};
