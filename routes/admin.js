// routes/admin.js
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const FeedSource = require('../models/FeedSource');
const User = require('../models/User');

router.use(protect);
router.use(adminOnly); // All admin routes require admin role

// Get all feed sources (global sources managed by admin)
router.get('/sources', async (req, res) => {
  try {
    const sources = await FeedSource.find({});
    res.json({
      status: 'success',
      count: sources.length,
      data: sources
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Create feed source
router.post('/sources', async (req, res) => {
  try {
    const { name, type, url, category } = req.body;
    
    if (!name || !type || !url) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, type, and url are required'
      });
    }
    
    const source = await FeedSource.create({ name, type, url, category });
    res.json({
      status: 'success',
      message: 'Source created',
      data: source
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update feed source
router.put('/sources/:sourceId', async (req, res) => {
  try {
    const { name, type, url, category, isActive } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (url) updateData.url = url;
    if (category) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const source = await FeedSource.findByIdAndUpdate(
      req.params.sourceId,
      updateData,
      { new: true }
    );
    
    if (!source) {
      return res.status(404).json({ status: 'error', message: 'Source not found' });
    }
    
    res.json({
      status: 'success',
      message: 'Source updated',
      data: source
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Delete feed source
router.delete('/sources/:sourceId', async (req, res) => {
  try {
    const source = await FeedSource.findByIdAndDelete(req.params.sourceId);
    
    if (!source) {
      return res.status(404).json({ status: 'error', message: 'Source not found' });
    }
    
    res.json({
      status: 'success',
      message: 'Source deleted'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get all categories (from all users, for admin reference)
router.get('/categories', async (req, res) => {
  try {
    const users = await User.find({ 'preferences.categories': { $exists: true, $ne: [] } });
    const allCategories = new Set();
    
    users.forEach(user => {
      if (user.preferences?.categories) {
        user.preferences.categories.forEach(cat => allCategories.add(cat));
      }
    });
    
    res.json({
      status: 'success',
      data: Array.from(allCategories)
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
