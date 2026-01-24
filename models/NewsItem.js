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
  // DEPRECATED: Category is now assigned at Topic level, not NewsItem level.
  // Kept for backward compatibility but no longer actively used.
  category: {
    type: String,
    trim: true
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
newsItemSchema.index({ topicId: 1 });
newsItemSchema.index({ topicId: 1, publishedAt: -1 }); // For filtering items by topic + time
newsItemSchema.index({ 'embedding': 1 }, { sparse: true }); // Sparse index for items with embeddings

// NOTE: For MongoDB Atlas Vector Search, you must also create a vector search index
// named "news_embedding_index" in Atlas UI or via the createSearchIndexes command.
// See scripts/setup-vector-index.js for setup instructions.

const NewsItem = mongoose.models.NewsItem || mongoose.model('NewsItem', newsItemSchema);
module.exports = NewsItem;
