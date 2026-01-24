// services/topicGrouper.js
const { categorizeNews, groupIntoTopics } = require('./llm');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const Category = require('../models/Category');
const { findUserByIdOrName } = require('../utils/userHelper');

// Helper function to fetch active categories from Category model
async function getActiveCategories() {
  const categoryDocs = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
  const categories = categoryDocs.map(c => c.name);
  return categories.length > 0 ? categories : ['general'];
}

// Categorize and group news items
async function categorizeAndGroup(newsItems, userId, categories) {
  // Categories are now passed from the caller (fetched from Category model)
  // Fallback to fetching from Category model if not provided
  if (!categories || categories.length === 0) {
    categories = await getActiveCategories();
  }
  
  if (categories.length === 0) {
    throw new Error('No categories available');
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
  categorizeAndGroup,
  getActiveCategories
};
