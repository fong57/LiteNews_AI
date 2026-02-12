// models/Article.js
const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  finalBody: {
    type: String,
    default: '',
    trim: true
  },
  hasFinalVersion: {
    type: Boolean,
    default: false,
    index: true
  },
  editorComment: {
    type: String,
    default: '',
    trim: true
  },
  references: [{
    title: { type: String, default: '' },
    url: { type: String, default: '' }
  }],
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
    index: true
  },
  sourceTopicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  sourceSocialPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialPost',
    default: null
  },
  sourceUrlArticleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SavedUrlArticle',
    default: null
  },
  sourceNewsItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NewsItem'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  archived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

articleSchema.index({ createdBy: 1, createdAt: -1 });

const Article = mongoose.models.Article || mongoose.model('Article', articleSchema);
module.exports = Article;
