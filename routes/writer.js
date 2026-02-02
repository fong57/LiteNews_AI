// routes/writer.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { findUserByIdOrName } = require('../utils/userHelper');
const WriterJob = require('../models/WriterJob');
const Article = require('../models/Article');
const Topic = require('../models/Topic');
const SocialPost = require('../models/SocialPost');
const { runArticleGraph } = require('../services/agenticWriter');

router.use(protect);

// POST /api/writer/generate – create job and kick off graph (async). Accept topicId or socialPostId.
router.post('/generate', async (req, res) => {
  try {
    const userIdRaw = req.user.userId || req.user.id;
    const user = await findUserByIdOrName(userIdRaw);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    const userId = user._id;

    const { topicId, socialPostId, options = {} } = req.body;
    if (topicId && socialPostId) {
      return res.status(400).json({ status: 'error', message: 'Provide either topicId or socialPostId, not both' });
    }
    if (!topicId && !socialPostId) {
      return res.status(400).json({ status: 'error', message: 'topicId or socialPostId is required' });
    }

    if (topicId) {
      if (!mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid topicId' });
      }
      const topic = await Topic.findById(topicId).populate('newsItems').exec();
      if (!topic) {
        return res.status(400).json({ status: 'error', message: 'Topic not found' });
      }
      const newsItems = topic.newsItems || [];
      if (!Array.isArray(newsItems) || newsItems.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Topic has no news items' });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(socialPostId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid socialPostId' });
      }
      const post = await SocialPost.findById(socialPostId).exec();
      if (!post) {
        return res.status(400).json({ status: 'error', message: 'Social post not found' });
      }
    }

    const job = await WriterJob.create({
      userId,
      topicId: topicId || null,
      socialPostId: socialPostId || null,
      status: 'pending',
      options: {
        tone: options.tone || 'neutral',
        length: options.length || 'medium',
        language: options.language || 'zh-TW'
      }
    });

    runArticleGraph(job._id).catch((err) => {
      console.error('[writer] runArticleGraph error:', err.message);
    });

    res.status(201).json({ status: 'success', jobId: job._id });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/writer/jobs/:id – poll job status (user-scoped)
router.get('/jobs/:id', async (req, res) => {
  try {
    const userIdRaw = req.user.userId || req.user.id;
    const user = await findUserByIdOrName(userIdRaw);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    const userId = user._id;

    const jobId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(404).json({ status: 'error', message: 'Job not found' });
    }

    const job = await WriterJob.findById(jobId).exec();
    if (!job) {
      return res.status(404).json({ status: 'error', message: 'Job not found' });
    }
    if (!job.userId.equals(userId)) {
      return res.status(404).json({ status: 'error', message: 'Job not found' });
    }

    res.json({
      status: job.status,
      articleId: job.articleId || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/writer/articles/:id – get single article (user-scoped)
router.get('/articles/:id', async (req, res) => {
  try {
    const userIdRaw = req.user.userId || req.user.id;
    const user = await findUserByIdOrName(userIdRaw);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    const userId = user._id;

    const articleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(404).json({ status: 'error', message: 'Article not found' });
    }

    const article = await Article.findById(articleId).exec();
    if (!article) {
      return res.status(404).json({ status: 'error', message: 'Article not found' });
    }
    if (!article.createdBy.equals(userId)) {
      return res.status(404).json({ status: 'error', message: 'Article not found' });
    }

    res.json({
      _id: article._id,
      title: article.title,
      body: article.body,
      status: article.status,
      sourceTopicId: article.sourceTopicId,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/writer/articles – list user's articles
router.get('/articles', async (req, res) => {
  try {
    const userIdRaw = req.user.userId || req.user.id;
    const user = await findUserByIdOrName(userIdRaw);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    const userId = user._id;

    const articles = await Article.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('title status createdAt _id')
      .lean()
      .exec();

    res.json({
      status: 'success',
      data: articles.map((a) => ({
        _id: a._id,
        title: a.title,
        status: a.status,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
