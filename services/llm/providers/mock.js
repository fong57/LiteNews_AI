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
    processed.add(i);

    // Find similar items by checking for common words
    for (let j = i + 1; j < newsItems.length; j++) {
      if (processed.has(j)) continue;
      
      const otherTitle = newsItems[j].title.toLowerCase();
      const hasCommonWords = titleWords.some(word => otherTitle.includes(word));

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

module.exports = {
  name: 'mock',
  categorizeNews,
  groupIntoTopics
};
