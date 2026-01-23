// routes/topics.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { rankTopicsByCategory } = require('../services/rankingService');
const Topic = require('../models/Topic');
const User = require('../models/User');
const { findUserByIdOrName } = require('../utils/userHelper');

router.use(protect);

// Get topics by category
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { category, limit = 5 } = req.query;
    
    if (!category) {
      return res.status(400).json({ status: 'error', message: 'Category is required' });
    }
    
    const topics = await rankTopicsByCategory(category, userId, parseInt(limit));
    
    res.json({
      status: 'success',
      count: topics.length,
      data: topics
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Submit feedback (thumbs up/down)
router.post('/:topicId/feedback', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { topicId } = req.params;
    const { feedback } = req.body; // 'up' or 'down'
    
    if (!['up', 'down'].includes(feedback)) {
      return res.status(400).json({ status: 'error', message: 'Feedback must be "up" or "down"' });
    }
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.topicPreferences) {
      user.topicPreferences = {
        likedTopics: [],
        dislikedTopics: [],
        topicScores: new Map()
      };
    }
    
    // Remove from both lists first
    user.topicPreferences.likedTopics = user.topicPreferences.likedTopics.filter(
      id => id.toString() !== topicId
    );
    user.topicPreferences.dislikedTopics = user.topicPreferences.dislikedTopics.filter(
      id => id.toString() !== topicId
    );
    
    // Add to appropriate list
    if (feedback === 'up') {
      user.topicPreferences.likedTopics.push(topicId);
    } else {
      user.topicPreferences.dislikedTopics.push(topicId);
    }
    
    await user.save();
    
    res.json({
      status: 'success',
      message: `Feedback recorded: ${feedback}`,
      data: {
        likedTopics: user.topicPreferences.likedTopics.length,
        dislikedTopics: user.topicPreferences.dislikedTopics.length
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
