// routes/news.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { fetchNewsForUser, parseTimeframe } = require('../services/newsFetcher');
const { categorizeAndGroup } = require('../services/topicGrouper');
const { initializeModel: ensureEmbeddingReady } = require('../services/embedding');
const { rankTopicsByCategory } = require('../services/rankingService');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const Category = require('../models/Category');
const { findUserByIdOrName } = require('../utils/userHelper');

router.use(protect);

// Fetch news (embedding service must be ready first so new items get embeddings)
router.post('/fetch', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { timeframe = '24h', useAllSources = false } = req.body;

    // Ensure embedding model is downloaded and loaded before fetching (so new items get embeddings)
    try {
      await ensureEmbeddingReady();
    } catch (embedError) {
      return res.status(503).json({
        status: 'error',
        message: 'Embedding service is not ready. News fetch requires it so items can be clustered into topics.',
        details: embedError.message || 'Model may still be downloading. Check internet connection, wait a few minutes, then try again.'
      });
    }

    const newsItems = await fetchNewsForUser(userId, timeframe, useAllSources);

    res.json({
      status: 'success',
      message: `Fetched ${newsItems.length} news items`,
      data: { count: newsItems.length, items: newsItems }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get news items
// Note: Category filtering now works via Topic association, not direct NewsItem.category
router.get('/items', async (req, res) => {
  try {
    const { category, topicId, timeframe = '24h' } = req.query;
    const sinceDate = parseTimeframe(timeframe);
    
    let query = { publishedAt: { $gte: sinceDate } };
    
    // Filter by specific topic
    if (topicId) {
      query.topicId = topicId;
    }
    // Filter by category via topic association
    else if (category) {
      // Find topics in this category, then get their news items
      const topicsInCategory = await Topic.find({ category }).select('_id');
      const topicIds = topicsInCategory.map(t => t._id);
      query.topicId = { $in: topicIds };
    }
    
    const items = await NewsItem.find(query)
      .sort({ publishedAt: -1 })
      .limit(100)
      .select('-embedding'); // Exclude large embedding field from response
    
    res.json({ status: 'success', count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Process and group news into topics
router.post('/process', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { timeframe = '24h' } = req.body;
    
    // Fetch news if not already done
    const sinceDate = parseTimeframe(timeframe);
    const newsItems = await NewsItem.find({ publishedAt: { $gte: sinceDate } });
    
    if (newsItems.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No news items found. Fetch news first.' });
    }
    
    // Fetch categories from Category model (global, admin-managed)
    const categoryDocs = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    let categories = categoryDocs.map(c => c.name);
    if (categories.length === 0) {
      categories = ['general']; // Fallback if no categories defined
    }
    
    // Categorize and group
    const topics = await categorizeAndGroup(newsItems, userId, categories);
    
    res.json({
      status: 'success',
      message: `Created ${topics.length} topics`,
      data: { topics }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
