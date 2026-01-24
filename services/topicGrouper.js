// services/topicGrouper.js
const { categorizeNews, groupIntoTopics } = require('./llm');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const { findUserByIdOrName } = require('../utils/userHelper');

// Categorize and group news items
async function categorizeAndGroup(newsItems, userId, categories) {
  const user = await findUserByIdOrName(userId);
  
  if (!user || !categories || categories.length === 0) {
    throw new Error('User not found or categories not set');
  }
  
  // Step 1: Categorize each news item
  for (const item of newsItems) {
    if (!item.category) {
      try {
        item.category = await categorizeNews(item, categories);
        await item.save();
      } catch (error) {
        console.error(`Error categorizing item ${item._id}:`, error.message);
        item.category = categories[0] || 'general';
        await item.save();
      }
    }
  }
  
  // Step 2: Group by category
  const itemsByCategory = {};
  for (const item of newsItems) {
    const cat = item.category || 'general';
    if (!itemsByCategory[cat]) {
      itemsByCategory[cat] = [];
    }
    itemsByCategory[cat].push(item);
  }
  
  // Step 3: Create topics for each category
  const topics = [];
  for (const [category, items] of Object.entries(itemsByCategory)) {
    try {
      const topicGroups = await groupIntoTopics(items, category);
      
      for (const group of topicGroups) {
        const topic = await Topic.create({
          title: group.title,
          summary: group.summary,
          category: category,
          newsItems: group.itemIds,
          discussionScore: group.itemIds.length // Simple score based on item count
        });
        
        // Update news items with topicId
        await NewsItem.updateMany(
          { _id: { $in: group.itemIds } },
          { topicId: topic._id }
        );
        
        topics.push(topic);
      }
    } catch (error) {
      console.error(`Error creating topics for category ${category}:`, error.message);
    }
  }
  
  return topics;
}

module.exports = {
  categorizeAndGroup
};
