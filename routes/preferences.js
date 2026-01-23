// routes/preferences.js
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const { findUserByIdOrName } = require('../utils/userHelper');

router.use(protect);

// Get user preferences
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin'; // Adjust based on your auth
    const user = await findUserByIdOrName(userId);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    res.json({
      status: 'success',
      data: {
        sources: user.preferences?.sources || [],
        categories: user.preferences?.categories || [],
        defaultTimeframe: user.preferences?.defaultTimeframe || '24h'
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update sources (users can set their own source priorities)
router.put('/sources', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sources } = req.body;
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.preferences) user.preferences = {};
    // Users can set priorities for sources, but sources are managed by admin
    user.preferences.sources = sources.map(source => ({
      ...source,
      priority: source.priority || 5 // Default priority
    }));
    await user.save();
    
    res.json({ status: 'success', message: 'Sources updated', data: user.preferences.sources });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get available sources (from admin or FeedSource)
router.get('/sources/available', async (req, res) => {
  try {
    const FeedSource = require('../models/FeedSource');
    const sources = await FeedSource.find({ isActive: true });
    
    res.json({
      status: 'success',
      data: sources
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update categories (admin only - users can only view available categories)
router.put('/categories', adminOnly, async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { categories } = req.body;
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.preferences) user.preferences = {};
    user.preferences.categories = categories;
    await user.save();
    
    res.json({ status: 'success', message: 'Categories updated', data: user.preferences.categories });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get available categories (for all users to select from)
router.get('/categories/available', async (req, res) => {
  try {
    // Get categories from admin user or from FeedSource model
    const adminUser = await User.findOne({ role: 'ADMIN' });
    const categories = adminUser?.preferences?.categories || [];
    
    res.json({
      status: 'success',
      data: categories
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update default timeframe
router.put('/timeframe', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { timeframe } = req.body;
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.preferences) user.preferences = {};
    user.preferences.defaultTimeframe = timeframe;
    await user.save();
    
    res.json({ status: 'success', message: 'Timeframe updated', data: user.preferences.defaultTimeframe });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
