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
const SavedUrlArticle = require('../models/SavedUrlArticle');
const { runArticleGraph } = require('../services/agenticWriter');

router.use(protect);

// POST /api/writer/generate – create job and kick off graph (async). Accept topicId, socialPostId, or urlArticleId.
router.post('/generate', async (req, res) => {
  try {
    const userIdRaw = req.user.userId || req.user.id;
    const user = await findUserByIdOrName(userIdRaw);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    const userId = user._id;

    const { topicId, socialPostId, urlArticleId, options = {} } = req.body;
    const provided = [topicId, socialPostId, urlArticleId].filter(Boolean);
    if (provided.length !== 1) {
      return res.status(400).json({ status: 'error', message: 'Provide exactly one of topicId, socialPostId, or urlArticleId' });
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
    } else if (socialPostId) {
      if (!mongoose.Types.ObjectId.isValid(socialPostId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid socialPostId' });
      }
      const post = await SocialPost.findById(socialPostId).exec();
      if (!post) {
        return res.status(400).json({ status: 'error', message: 'Social post not found' });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(urlArticleId)) {
        return res.status(400).json({ status: 'error', message: 'Invalid urlArticleId' });
      }
      const urlArticle = await SavedUrlArticle.findById(urlArticleId).exec();
      if (!urlArticle) {
        return res.status(400).json({ status: 'error', message: 'URL article not found' });
      }
      if (!urlArticle.userId.equals(userId)) {
        return res.status(403).json({ status: 'error', message: 'URL article not found' });
      }
    }

    const job = await WriterJob.create({
      userId,
      topicId: topicId || null,
      socialPostId: socialPostId || null,
      urlArticleId: urlArticleId || null,
      status: 'pending',
      options: {
        tone: options.tone || 'neutral',
        length: typeof options.length === 'number' ? options.length : (parseInt(options.length, 10) || 800),
        language: options.language || 'zh-TW',
        articleType: options.articleType || '懶人包',
        extraInstructions: options.extraInstructions || '',
        publication: options.publication || 'LiteNews',
        maxResearchArticles: options.maxResearchArticles ?? 8
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

    const job = await WriterJob.findOne({ articleId: article._id }).select('runLog').lean().exec();
    res.json({
      _id: article._id,
      title: article.title,
      body: article.body,
      status: article.status,
      finalBody: article.finalBody || '',
      hasFinalVersion: !!article.hasFinalVersion,
      editorComment: article.editorComment || '',
      references: article.references || [],
      runLog: job?.runLog || null,
      sourceTopicId: article.sourceTopicId,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// PATCH /api/writer/articles/:id – save final version (user-scoped)
router.patch('/articles/:id', async (req, res) => {
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

    const { finalBody, editorComment } = req.body;
    const hasFinalVersion = typeof finalBody === 'string' && finalBody.trim().length > 0;
    const update = {
      finalBody: typeof finalBody === 'string' ? finalBody.trim() : (article.finalBody || ''),
      hasFinalVersion,
      editorComment: typeof editorComment === 'string' ? editorComment.trim() : (article.editorComment || '')
    };
    await article.updateOne(update).exec();

    res.json({
      status: 'success',
      hasFinalVersion,
      message: hasFinalVersion ? '已儲存最終版本' : '已清除最終版本'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// DELETE /api/writer/articles/:id – archive article (user-scoped; sets archived=true, no longer shown in list)
router.delete('/articles/:id', async (req, res) => {
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

    await article.updateOne({ archived: true }).exec();

    res.json({ status: 'success', message: '已封存文章' });
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

    const articles = await Article.find({ createdBy: userId, archived: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('title status createdAt _id hasFinalVersion')
      .lean()
      .exec();

    res.json({
      status: 'success',
      data: articles.map((a) => ({
        _id: a._id,
        title: a.title,
        status: a.status,
        createdAt: a.createdAt,
        hasFinalVersion: !!a.hasFinalVersion
      }))
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
