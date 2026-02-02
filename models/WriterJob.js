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
    length: { type: String, default: 'medium' },
    language: { type: String, default: 'zh-TW' }
  }
}, {
  timestamps: true
});

writerJobSchema.index({ userId: 1, createdAt: -1 });

const WriterJob = mongoose.models.WriterJob || mongoose.model('WriterJob', writerJobSchema);
module.exports = WriterJob;
