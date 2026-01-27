// models/SocialPost.js
const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mastodon', 'youtube', 'x', 'instagram'],
    required: true
  },
  handleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SocialHandle',
    required: true
  },
  handle: {
    type: String,
    required: true,
    trim: true
  },
  externalId: {
    type: String,
    required: true
  },
  content: {
    type: String,
    trim: true
  },
  title: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  publishedAt: {
    type: Date,
    required: true
  },
  author: {
    handle: String,
    displayName: String,
    avatarUrl: String
  },
  engagement: {
    likes: { type: Number, default: 0 },
    reposts: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    views: { type: Number, default: 0 }, // For YouTube
    comments: { type: Number, default: 0 }, // For YouTube (replies equivalent)
    score: { type: Number, default: 0 } // Computed popularity score
  },
  metadata: {
    mediaUrls: [String],
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
socialPostSchema.index({ handleId: 1, publishedAt: -1 });
socialPostSchema.index({ handleId: 1, 'engagement.score': -1 });
socialPostSchema.index({ platform: 1, externalId: 1 }, { unique: true }); // Prevent duplicates

const SocialPost = mongoose.models.SocialPost || mongoose.model('SocialPost', socialPostSchema);
module.exports = SocialPost;
