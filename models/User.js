// models/User.js - Extended with preferences
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  role: {
    type: String,
    enum: ['ADMIN', 'USER'],
    default: 'USER',
    required: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  preferences: {
    sources: [{
      type: { type: String, enum: ['rss', 'instagram', 'x', 'website'], required: true },
      url: String,
      handle: String,
      name: String,
      priority: { type: Number, default: 5, min: 1, max: 10 }
    }],
    // Note: categories moved to separate Category model (admin-managed)
    defaultTimeframe: { type: String, default: '24h', enum: ['24h', '7d', '30d'] }
  },
  topicPreferences: {
    likedTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    dislikedTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    topicScores: {
      type: Map,
      of: Number,
      default: {}
    }
  }
}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;