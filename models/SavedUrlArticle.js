// models/SavedUrlArticle.js - User-saved news article URL (素材夾 custom link)
const mongoose = require('mongoose');

const savedUrlArticleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  image: {
    type: String,
    trim: true,
    default: null
  },
  siteName: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true
});

savedUrlArticleSchema.index({ userId: 1, createdAt: -1 });

const SavedUrlArticle = mongoose.models.SavedUrlArticle || mongoose.model('SavedUrlArticle', savedUrlArticleSchema);
module.exports = SavedUrlArticle;
