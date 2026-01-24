// routes/admin.js
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const FeedSource = require('../models/FeedSource');
const User = require('../models/User');
const Category = require('../models/Category');

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
    const { name, type, url, remark } = req.body;
    
    if (!name || !type || !url) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, type, and url are required'
      });
    }
    
    const source = await FeedSource.create({ name, type, url, remark });
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
    const { name, type, url, remark, isActive } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (url) updateData.url = url;
    if (remark) updateData.remark = remark;
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

// ==================== CATEGORY CRUD ====================

// Get all categories (admin)
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 });
    res.json({
      status: 'success',
      count: categories.length,
      data: categories
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Create category (admin)
router.post('/categories', async (req, res) => {
  try {
    const { name, displayName, description, sortOrder } = req.body;
    
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Category name is required'
      });
    }
    
    const category = await Category.create({
      name: name.toLowerCase().trim(),
      displayName: displayName || name,
      description,
      sortOrder: sortOrder || 0
    });
    
    res.json({
      status: 'success',
      message: 'Category created',
      data: category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ status: 'error', message: 'Category already exists' });
    }
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update category (admin)
router.put('/categories/:categoryId', async (req, res) => {
  try {
    const { displayName, description, isActive, sortOrder } = req.body;
    const updateData = {};
    
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    
    const category = await Category.findByIdAndUpdate(
      req.params.categoryId,
      updateData,
      { new: true }
    );
    
    if (!category) {
      return res.status(404).json({ status: 'error', message: 'Category not found' });
    }
    
    res.json({
      status: 'success',
      message: 'Category updated',
      data: category
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Delete category (admin)
router.delete('/categories/:categoryId', async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.categoryId);
    
    if (!category) {
      return res.status(404).json({ status: 'error', message: 'Category not found' });
    }
    
    res.json({
      status: 'success',
      message: 'Category deleted'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
