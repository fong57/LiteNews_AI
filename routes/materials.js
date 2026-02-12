// routes/materials.js - 素材夾 API (saved topics, social posts, and URL articles persisted to DB)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Topic = require('../models/Topic');
const SocialPost = require('../models/SocialPost');
const SavedUrlArticle = require('../models/SavedUrlArticle');
const { findUserByIdOrName } = require('../utils/userHelper');
const { extractUrlMeta, normalizeUrl } = require('../utils/extractUrlMeta');

router.use(protect);

// GET /api/materials - current user's saved topics, social posts, and URL articles (populated)
router.get('/', async (req, res) => {
  try {
    const userDoc = await findUserByIdOrName(req.user.userId);
    if (!userDoc) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const user = await User.findById(userDoc._id)
      .populate('savedTopics')
      .populate({ path: 'savedSocialPosts', populate: { path: 'handleId', select: 'displayName handle' } })
      .populate({ path: 'savedUrlArticles', match: { archived: { $ne: true } } })
      .lean();

    const topics = (user.savedTopics || []).filter(Boolean);
    const socialPosts = (user.savedSocialPosts || []).filter(Boolean);
    const urlArticles = (user.savedUrlArticles || []).filter(Boolean);

    res.json({
      status: 'success',
      data: { topics, socialPosts, urlArticles }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/materials/topics - add topic to 素材夾
router.post('/topics', async (req, res) => {
  try {
    const { topicId } = req.body;
    if (!topicId) {
      return res.status(400).json({ status: 'error', message: 'topicId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid topicId' });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ status: 'error', message: 'Topic not found' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    user.savedTopics = user.savedTopics || [];
    if (user.savedTopics.some(id => id.toString() === topicId)) {
      return res.json({ status: 'success', message: 'Already in 素材夾' });
    }
    user.savedTopics.push(topic._id);
    await user.save();

    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// DELETE /api/materials/topics/:topicId - archive topic (remove from 素材夾 display)
router.delete('/topics/:topicId', async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid topicId' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const oid = new mongoose.Types.ObjectId(topicId);
    user.savedTopics = (user.savedTopics || []).filter(id => id.toString() !== topicId);
    user.archivedTopicIds = user.archivedTopicIds || [];
    if (!user.archivedTopicIds.some(id => id.toString() === topicId)) {
      user.archivedTopicIds.push(oid);
    }
    await user.save();

    res.json({ status: 'success', message: '已封存' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/materials/social-posts - add social post to 素材夾
router.post('/social-posts', async (req, res) => {
  try {
    const { socialPostId } = req.body;
    if (!socialPostId) {
      return res.status(400).json({ status: 'error', message: 'socialPostId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(socialPostId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid socialPostId' });
    }

    const post = await SocialPost.findById(socialPostId);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Social post not found' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    user.savedSocialPosts = user.savedSocialPosts || [];
    if (user.savedSocialPosts.some(id => id.toString() === socialPostId)) {
      return res.json({ status: 'success', message: 'Already in 素材夾' });
    }
    user.savedSocialPosts.push(post._id);
    await user.save();

    res.json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// DELETE /api/materials/social-posts/:socialPostId - archive social post (remove from 素材夾 display)
router.delete('/social-posts/:socialPostId', async (req, res) => {
  try {
    const { socialPostId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(socialPostId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid socialPostId' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const oid = new mongoose.Types.ObjectId(socialPostId);
    user.savedSocialPosts = (user.savedSocialPosts || []).filter(id => id.toString() !== socialPostId);
    user.archivedSocialPostIds = user.archivedSocialPostIds || [];
    if (!user.archivedSocialPostIds.some(id => id.toString() === socialPostId)) {
      user.archivedSocialPostIds.push(oid);
    }
    await user.save();

    res.json({ status: 'success', message: '已封存' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// POST /api/materials/url-articles - add URL article to 素材夾 (fetch and extract meta)
router.post('/url-articles', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ status: 'error', message: 'url is required' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const normalizedUrl = normalizeUrl(url);

    // Check if already saved (by URL)
    user.savedUrlArticles = user.savedUrlArticles || [];
    const existing = await SavedUrlArticle.findOne({
      _id: { $in: user.savedUrlArticles },
      url: normalizedUrl
    });
    if (existing) {
      return res.json({ status: 'success', message: 'Already in 素材夾' });
    }

    let meta;
    try {
      meta = await extractUrlMeta(normalizedUrl);
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'Could not fetch or parse URL'
      });
    }

    const doc = await SavedUrlArticle.create({
      userId: user._id,
      url: normalizedUrl,
      title: meta.title || normalizedUrl,
      description: meta.description || '',
      image: meta.image,
      siteName: meta.siteName
    });

    user.savedUrlArticles.push(doc._id);
    await user.save();

    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// DELETE /api/materials/url-articles/:id - archive URL article (no longer shown in 素材夾)
router.delete('/url-articles/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid id' });
    }

    const user = await findUserByIdOrName(req.user.userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const doc = await SavedUrlArticle.findById(id);
    if (!doc) {
      return res.status(404).json({ status: 'error', message: 'URL article not found' });
    }
    if (!doc.userId.equals(user._id)) {
      return res.status(404).json({ status: 'error', message: 'URL article not found' });
    }

    await doc.updateOne({ archived: true }).exec();

    res.json({ status: 'success', message: '已封存' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
