// routes/preferences.js
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Category = require('../models/Category');
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
    
    // Fetch categories from Category model (global, admin-managed)
    const categoryDocs = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    // Return category objects with both name (for API queries) and displayName (for UI display)
    const categories = categoryDocs.map(c => ({
      name: c.name,
      displayName: c.displayName || c.name
    }));
    
    res.json({
      status: 'success',
      data: {
        sources: user.preferences?.sources || [],
        categories: categories, // Now from Category model with name and displayName
        defaultTimeframe: user.preferences?.defaultTimeframe || '24h',
        socialHandlesOrder: user.preferences?.socialHandlesOrder || []
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

// Note: PUT /categories removed - category management now handled via /api/admin/categories

// Get available categories (for all users to select from - READ ONLY)
router.get('/categories/available', async (req, res) => {
  try {
    // Fetch from Category model (global, admin-managed)
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    
    res.json({
      status: 'success',
      data: categories.map(c => c.displayName || c.name)
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

// Update social handles display order (users can set their own order)
router.put('/social-handles-order', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { handleIds } = req.body; // Array of handle IDs in desired order
    
    if (!Array.isArray(handleIds)) {
      return res.status(400).json({ status: 'error', message: 'handleIds must be an array' });
    }
    
    const user = await findUserByIdOrName(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!user.preferences) user.preferences = {};
    
    // Validate that all handle IDs are valid ObjectIds
    const mongoose = require('mongoose');
    const validHandleIds = handleIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    user.preferences.socialHandlesOrder = validHandleIds.map(id => new mongoose.Types.ObjectId(id));
    await user.save();
    
    res.json({ 
      status: 'success', 
      message: 'Social handles order updated', 
      data: user.preferences.socialHandlesOrder 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
