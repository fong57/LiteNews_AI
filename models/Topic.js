// models/Topic.js
const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  summary: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  newsItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NewsItem'
  }],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  discussionScore: {
    type: Number,
    default: 0
  },
  userScore: {
    type: Number,
    default: 0
  },
  finalScore: {
    type: Number,
    default: 0,
    index: true
  }
}, {
  timestamps: true
});

topicSchema.index({ category: 1, finalScore: -1 });

const Topic = mongoose.models.Topic || mongoose.model('Topic', topicSchema);
module.exports = Topic;
