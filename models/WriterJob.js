// models/WriterJob.js
const mongoose = require('mongoose');

const writerJobSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  socialPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialPost',
    default: null
  },
  urlArticleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SavedUrlArticle',
    default: null
  },
  // Custom topic from 寫作中心「開始寫作」：user types topic; passed as title/summary to graph
  customTitle: { type: String, default: null },
  customSummary: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    default: null
  },
  error: {
    type: String,
    default: null
  },
  options: {
    tone: { type: String, default: 'neutral' },
    length: { type: Number, default: 800 },
    language: { type: String, default: 'zh-TW' },
    articleType: { type: String, default: '懶人包' },
    extraInstructions: { type: String, default: '' },
    targetAudience: { type: String, default: 'general' },
    publication: { type: String, default: 'LiteNews' },
    maxResearchArticles: { type: Number, default: 8 }
  },
  runLog: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: true
});

writerJobSchema.index({ userId: 1, createdAt: -1 });

const WriterJob = mongoose.models.WriterJob || mongoose.model('WriterJob', writerJobSchema);
module.exports = WriterJob;
