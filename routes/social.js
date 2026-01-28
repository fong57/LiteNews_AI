// routes/social.js
const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { fetchFeedsForAllHandles, fetchFeedForHandle } = require('../services/socialFeedFetcher');
const SocialHandle = require('../models/SocialHandle');
const SocialPost = require('../models/SocialPost');
const User = require('../models/User');
const { findUserByIdOrName } = require('../utils/userHelper');

router.use(protect);

// Get all active social handles (respects user's display order preference)
router.get('/handles', async (req, res) => {
  try {
    // Get all active handles
    const allHandles = await SocialHandle.find({ isActive: true })
      .sort({ platform: 1, handle: 1 });
    
    // Get user's preferred order
    let handles = allHandles;
    try {
      const userId = req.user.userId;
      if (userId) {
        const user = await findUserByIdOrName(userId);
        if (user && user.preferences && user.preferences.socialHandlesOrder) {
          const userOrder = user.preferences.socialHandlesOrder.map(id => id.toString());
          
          // Create a map for quick lookup
          const handleMap = new Map(allHandles.map(h => [h._id.toString(), h]));
          
          // Sort handles according to user's order
          const orderedHandles = [];
          const unorderedHandles = [];
          
          // First, add handles in user's preferred order
          for (const handleId of userOrder) {
            if (handleMap.has(handleId)) {
              orderedHandles.push(handleMap.get(handleId));
              handleMap.delete(handleId);
            }
          }
          
          // Then, add remaining handles that weren't in user's order
          for (const handle of allHandles) {
            if (!userOrder.includes(handle._id.toString())) {
              unorderedHandles.push(handle);
            }
          }
          
          // Combine: ordered handles first, then unordered handles
          handles = [...orderedHandles, ...unorderedHandles];
        }
      }
    } catch (userError) {
      // If there's an error getting user preferences, fall back to default order
      console.error('Error getting user preferences:', userError);
    }
    
    res.json({
      status: 'success',
      count: handles.length,
      data: handles
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get feed for a specific handle
router.get('/feed', async (req, res) => {
  try {
    const { handleId, sort = 'recency', limit = 20 } = req.query;
    
    if (!handleId) {
      return res.status(400).json({ status: 'error', message: 'handleId is required' });
    }
    
    const handle = await SocialHandle.findById(handleId);
    if (!handle) {
      return res.status(404).json({ status: 'error', message: 'Handle not found' });
    }
    
    let query = { handleId: handleId };
    let sortOption = {};
    
    if (sort === 'popularity') {
      sortOption = { 'engagement.score': -1 };
    } else if (sort === 'updatedAt') {
      // Sort by updatedAt (更新時間)
      sortOption = { updatedAt: -1 };
    } else if (sort === 'recency') {
      // Sort by publishedAt (首發時間)
      sortOption = { publishedAt: -1 };
    } else {
      // Default: updatedAt
      sortOption = { updatedAt: -1 };
    }
    
    const posts = await SocialPost.find(query)
      .sort(sortOption)
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      status: 'success',
      count: posts.length,
      data: {
        handle: handle,
        posts: posts
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Get all social handles (admin)
router.get('/admin/handles', adminOnly, async (req, res) => {
  try {
    const handles = await SocialHandle.find({})
      .sort({ platform: 1, handle: 1 });
    
    res.json({
      status: 'success',
      count: handles.length,
      data: handles
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Create social handle (admin)
router.post('/admin/handles', adminOnly, async (req, res) => {
  try {
    const { platform, handle, instanceBaseUrl, displayName, remark, isActive } = req.body;
    
    if (!platform || !handle) {
      return res.status(400).json({
        status: 'error',
        message: 'Platform and handle are required'
      });
    }
    
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Display name is required'
      });
    }
    
    if (!['youtube', 'x', 'instagram', 'threads', 'facebook'].includes(platform)) {
      return res.status(400).json({
        status: 'error',
        message: 'Platform must be "youtube", "x", "instagram", "threads", or "facebook"'
      });
    }
    
    const socialHandle = await SocialHandle.create({
      platform,
      handle,
      instanceBaseUrl,
      displayName,
      remark,
      isActive: isActive !== undefined ? isActive : true
    });
    
    res.json({
      status: 'success',
      message: 'Social handle created',
      data: socialHandle
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ status: 'error', message: 'Handle already exists' });
    }
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update social handle (admin)
router.put('/admin/handles/:handleId', adminOnly, async (req, res) => {
  try {
    const { handleId } = req.params;
    const { platform, handle, instanceBaseUrl, displayName, remark, isActive, avatarUrl } = req.body;
    
    // Validate displayName if provided
    if (displayName !== undefined && (!displayName || !displayName.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Display name is required'
      });
    }
    
    const updateData = {};
    if (platform) updateData.platform = platform;
    if (handle) updateData.handle = handle;
    if (instanceBaseUrl !== undefined) updateData.instanceBaseUrl = instanceBaseUrl;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (remark !== undefined) updateData.remark = remark;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    
    const socialHandle = await SocialHandle.findByIdAndUpdate(
      handleId,
      updateData,
      { new: true }
    );
    
    if (!socialHandle) {
      return res.status(404).json({ status: 'error', message: 'Handle not found' });
    }
    
    res.json({
      status: 'success',
      message: 'Social handle updated',
      data: socialHandle
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Delete social handle (admin)
router.delete('/admin/handles/:handleId', adminOnly, async (req, res) => {
  try {
    const { handleId } = req.params;
    
    const socialHandle = await SocialHandle.findByIdAndDelete(handleId);
    
    if (!socialHandle) {
      return res.status(404).json({ status: 'error', message: 'Handle not found' });
    }
    
    // Optionally delete associated posts
    await SocialPost.deleteMany({ handleId: handleId });
    
    res.json({
      status: 'success',
      message: 'Social handle deleted'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch feed for specific handle (admin)
router.post('/admin/handles/:handleId/fetch', adminOnly, async (req, res) => {
  try {
    const { handleId } = req.params;
    if (!handleId || handleId === 'undefined' || handleId === 'null') {
      return res.status(400).json({ status: 'error', message: 'handleId is required' });
    }
    const result = await fetchFeedForHandle(handleId);
    
    res.json({
      status: 'success',
      message: `Fetched ${result.postsFetched} posts`,
      data: result
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Fetch/refresh feeds for all handles (must be after /admin/handles/:handleId/fetch so single-handle is matched first)
router.post('/fetch', async (req, res) => {
  try {
    const results = await fetchFeedsForAllHandles();
    
    res.json({
      status: 'success',
      message: `Fetched feeds for ${results.success} handle(s)`,
      data: results
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
