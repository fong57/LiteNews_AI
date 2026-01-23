// services/rankingService.js
const Topic = require('../models/Topic');
const User = require('../models/User');
const { findUserByIdOrName } = require('../utils/userHelper');

// Calculate discussion score based on volume and recency
function calculateDiscussionScore(topic) {
  const itemCount = topic.newsItems.length;
  const ageHours = (Date.now() - topic.createdAt) / (1000 * 60 * 60);
  const recencyFactor = Math.max(0, 1 - ageHours / 48); // Decay over 48 hours
  
  return itemCount * 10 + recencyFactor * 50;
}

// Apply user preference scores
function applyUserPreferences(topic, userId) {
  return findUserByIdOrName(userId).then(user => {
    if (!user || !user.topicPreferences) {
      return 0;
    }
    
    const topicIdStr = topic._id.toString();
    const liked = user.topicPreferences.likedTopics?.some(id => id.toString() === topicIdStr);
    const disliked = user.topicPreferences.dislikedTopics?.some(id => id.toString() === topicIdStr);
    
    if (liked) return 1.5; // +50% boost
    if (disliked) return 0.5; // -50% penalty
    
    // Check if there's a stored score
    const storedScore = user.topicPreferences.topicScores?.get?.(topicIdStr);
    return storedScore ? storedScore / 100 : 1.0; // Normalize stored score
  });
}

// Rank topics within a category
async function rankTopicsByCategory(category, userId, limit = 5) {
  const topics = await Topic.find({ category })
    .populate('newsItems')
    .sort({ createdAt: -1 });
  
  // Calculate scores for each topic
  const topicsWithScores = await Promise.all(
    topics.map(async (topic) => {
      const discussionScore = calculateDiscussionScore(topic);
      const userMultiplier = await applyUserPreferences(topic, userId);
      const finalScore = discussionScore * userMultiplier;
      
      topic.discussionScore = discussionScore;
      topic.userScore = userMultiplier;
      topic.finalScore = finalScore;
      await topic.save();
      
      return topic;
    })
  );
  
  // Sort by final score and limit
  return topicsWithScores
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}

module.exports = {
  rankTopicsByCategory,
  calculateDiscussionScore,
  applyUserPreferences
};
