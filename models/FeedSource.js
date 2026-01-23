// models/FeedSource.js
const mongoose = require('mongoose');

const feedSourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['rss', 'api', 'scraper'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  category: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastFetched: Date
}, {
  timestamps: true
});

const FeedSource = mongoose.models.FeedSource || mongoose.model('FeedSource', feedSourceSchema);
module.exports = FeedSource;
