// models/SocialHandle.js
const mongoose = require('mongoose');

const socialHandleSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mastodon', 'youtube', 'x', 'instagram'],
    required: true
  },
  handle: {
    type: String,
    required: true,
    trim: true
  },
  instanceBaseUrl: {
    type: String,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  avatarUrl: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastFetchedAt: {
    type: Date
  },
  remark: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for active handles lookup
socialHandleSchema.index({ isActive: 1, platform: 1 });

const SocialHandle = mongoose.models.SocialHandle || mongoose.model('SocialHandle', socialHandleSchema);
module.exports = SocialHandle;
