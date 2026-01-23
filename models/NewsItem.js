// models/NewsItem.js
const mongoose = require('mongoose');

const newsItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  source: {
    type: { type: String, enum: ['rss', 'instagram', 'x', 'web'], required: true },
    name: String,
    url: String,
    priority: { type: Number, default: 5 }
  },
  publishedAt: {
    type: Date,
    required: true
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  category: {
    type: String,
    trim: true,
    index: true
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  },
  embedding: [Number],
  metadata: {
    author: String,
    imageUrl: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
newsItemSchema.index({ publishedAt: -1 });
newsItemSchema.index({ category: 1, publishedAt: -1 });
newsItemSchema.index({ topicId: 1 });

const NewsItem = mongoose.models.NewsItem || mongoose.model('NewsItem', newsItemSchema);
module.exports = NewsItem;
