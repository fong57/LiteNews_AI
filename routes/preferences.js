// routes/preferences.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
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

// Update sources
router.put('/sources', async (req, res) => {
  try {
    const userId = req.user.userId || 'admin';
    const { sources } = req.body;
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.preferences) user.preferences = {};
    user.preferences.sources = sources;
    await user.save();
    
    res.json({ status: 'success', message: 'Sources updated', data: user.preferences.sources });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update categories
router.put('/categories', async (req, res) => {
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
