// routes/news.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { fetchNewsForUser, parseTimeframe } = require('../services/newsFetcher');
const { categorizeAndGroup } = require('../services/topicGrouper');
const { rankTopicsByCategory } = require('../services/rankingService');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const { findUserByIdOrName } = require('../utils/userHelper');

router.use(protect);

// Fetch news
router.post('/fetch', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { timeframe = '24h' } = req.body;
    
    const newsItems = await fetchNewsForUser(userId, timeframe);
    
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
router.get('/items', async (req, res) => {
  try {
    const { category, timeframe = '24h' } = req.query;
    const sinceDate = parseTimeframe(timeframe);
    
    const query = { publishedAt: { $gte: sinceDate } };
    if (category) query.category = category;
    
    const items = await NewsItem.find(query)
      .sort({ publishedAt: -1 })
      .limit(100);
    
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
    
    const user = await findUserByIdOrName(userId);
    const categories = user?.preferences?.categories || ['general'];
    
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
