// models/User.js - Extended with preferences
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    unique: true
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [1, 'Age must be at least 1']
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
    categories: [{
      type: String,
      trim: true
    }],
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