// services/topicGrouper.js
// Restructured: Vector-based clustering with topic-level categorization

const { categorizeTopic, generateTopicMetadata } = require('./llm');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const Category = require('../models/Category');
const { cosineSimilarity, EMBEDDING_DIMENSIONS } = require('./embedding');

// Clustering configuration
const SIMILARITY_THRESHOLD = parseFloat(process.env.CLUSTERING_THRESHOLD) || 0.65;
const MIN_CLUSTER_SIZE = parseInt(process.env.MIN_CLUSTER_SIZE) || 1;
const MAX_CLUSTER_SIZE = parseInt(process.env.MAX_CLUSTER_SIZE) || 20;

// Helper function to fetch active categories from Category model
async function getActiveCategories() {
  const categoryDocs = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
  const categories = categoryDocs.map(c => c.name);
  return categories.length > 0 ? categories : ['general'];
}

/**
 * Find similar news items using MongoDB Atlas Vector Search
 * @param {Object} newsItem - The news item to find similar items for
 * @param {number} limit - Maximum number of similar items to return
 * @returns {Promise<Array>} - Array of similar news items with scores
 */
async function findSimilarItems(newsItem, limit = 10) {
  if (!newsItem.embedding || newsItem.embedding.length === 0) {
    return [];
  }

  try {
    // MongoDB Atlas Vector Search aggregation
    const results = await NewsItem.aggregate([
      {
        $vectorSearch: {
          index: 'news_embedding_index',
          path: 'embedding',
          queryVector: newsItem.embedding,
          numCandidates: limit * 10,
          limit: limit + 1 // +1 to exclude self
        }
      },
      {
        $match: {
          _id: { $ne: newsItem._id },
          topicId: { $exists: false } // Only unclustered items
        }
      },
      {
        $addFields: {
          score: { $meta: 'vectorSearchScore' }
        }
      },
      {
        $match: {
          score: { $gte: SIMILARITY_THRESHOLD }
        }
      }
    ]);

    return results;
  } catch (error) {
    // Fallback to manual similarity calculation if Atlas Vector Search not available
    if (error.message.includes('$vectorSearch') || error.codeName === 'InvalidPipelineOperator') {
      console.log('   ⚠️ Atlas Vector Search not available, using manual clustering');
      return findSimilarItemsManual(newsItem, limit);
    }
    throw error;
  }
}

/**
 * Manual similarity search fallback (for non-Atlas deployments)
 * @param {Object} newsItem - The news item to find similar items for
 * @param {number} limit - Maximum number of similar items to return
 * @returns {Promise<Array>} - Array of similar news items with scores
 */
async function findSimilarItemsManual(newsItem, limit = 10) {
  if (!newsItem.embedding || newsItem.embedding.length === 0) {
    return [];
  }

  // Get all unclustered items with embeddings
  const candidates = await NewsItem.find({
    _id: { $ne: newsItem._id },
    topicId: { $exists: false },
    embedding: { $exists: true, $ne: [] }
  }).lean();

  // Calculate similarity scores
  const scored = candidates
    .map(candidate => ({
      ...candidate,
      score: cosineSimilarity(newsItem.embedding, candidate.embedding)
    }))
    .filter(item => item.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/**
 * Cluster news items based on vector similarity
 * Uses a greedy clustering approach
 * @param {Array} newsItems - Array of news items to cluster
 * @returns {Promise<Array>} - Array of clusters (each cluster is an array of news item IDs)
 */
async function clusterNewsItems(newsItems) {
  console.log(`📊 Clustering ${newsItems.length} news items by vector similarity...`);

  // Filter items that have embeddings
  const itemsWithEmbeddings = newsItems.filter(
    item => item.embedding && item.embedding.length === EMBEDDING_DIMENSIONS
  );

  if (itemsWithEmbeddings.length === 0) {
    console.log('   ⚠️ No items with embeddings found, skipping clustering');
    return [];
  }

  console.log(`   ${itemsWithEmbeddings.length} items have embeddings`);

  const clusters = [];
  const clusteredIds = new Set();

  // Sort by publishedAt (newest first) to make newer items cluster seeds
  const sortedItems = [...itemsWithEmbeddings].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );

  for (const seedItem of sortedItems) {
    // Skip if already clustered
    if (clusteredIds.has(seedItem._id.toString())) {
      continue;
    }

    // Find similar items
    const similarItems = await findSimilarItems(seedItem, MAX_CLUSTER_SIZE);

    // Create cluster with seed + similar items
    const clusterItems = [seedItem];

    for (const similar of similarItems) {
      if (!clusteredIds.has(similar._id.toString())) {
        clusterItems.push(similar);
        if (clusterItems.length >= MAX_CLUSTER_SIZE) break;
      }
    }

    // Only create cluster if it meets minimum size
    if (clusterItems.length >= MIN_CLUSTER_SIZE) {
      const cluster = {
        items: clusterItems,
        itemIds: clusterItems.map(item => item._id)
      };
      clusters.push(cluster);

      // Mark all items in cluster as processed
      clusterItems.forEach(item => clusteredIds.add(item._id.toString()));
    }
  }

  // Handle unclustered items as single-item clusters
  const unclusteredItems = sortedItems.filter(
    item => !clusteredIds.has(item._id.toString())
  );

  if (unclusteredItems.length > 0 && MIN_CLUSTER_SIZE === 1) {
    for (const item of unclusteredItems) {
      clusters.push({
        items: [item],
        itemIds: [item._id]
      });
    }
  }

  console.log(`   ✅ Created ${clusters.length} clusters`);
  return clusters;
}

/**
 * Create topics from clusters and categorize them
 * @param {Array} clusters - Array of clusters from clusterNewsItems
 * @param {Array} categories - Available categories
 * @returns {Promise<Array>} - Array of created Topic documents
 */
async function createTopicsFromClusters(clusters, categories) {
  if (!categories || categories.length === 0) {
    categories = await getActiveCategories();
  }

  console.log(`📝 Creating topics from ${clusters.length} clusters...`);

  const topics = [];

  for (const cluster of clusters) {
    try {
      // Generate topic metadata (title, summary, tags) using LLM
      const metadata = await generateTopicMetadata(cluster.items);

      // Categorize the topic using LLM
      const category = await categorizeTopic(metadata, categories);

      // Create the topic
      const topic = await Topic.create({
        title: metadata.title,
        summary: metadata.summary,
        category: category,
        newsItems: cluster.itemIds,
        tags: metadata.tags || [],
        discussionScore: cluster.items.length // Simple score based on cluster size
      });

      // Update news items with topicId
      await NewsItem.updateMany(
        { _id: { $in: cluster.itemIds } },
        { topicId: topic._id }
      );

      topics.push(topic);
    } catch (error) {
      console.error(`   ❌ Error creating topic from cluster:`, error.message);
    }
  }

  console.log(`   ✅ Created ${topics.length} topics`);
  return topics;
}

/**
 * Main function: Cluster news items and create categorized topics
 * @param {Array} newsItems - Array of news items to process
 * @param {string} userId - User ID (for future user-specific categorization)
 * @param {Array} categories - Available categories
 * @returns {Promise<Array>} - Array of created Topic documents
 */
async function clusterAndCategorize(newsItems, userId, categories) {
  // Fetch categories if not provided
  if (!categories || categories.length === 0) {
    categories = await getActiveCategories();
  }

  if (categories.length === 0) {
    throw new Error('No categories available');
  }

  // Step 1: Cluster news items by vector similarity
  const clusters = await clusterNewsItems(newsItems);

  if (clusters.length === 0) {
    console.log('   ℹ️ No clusters created');
    return [];
  }

  // Step 2: Create topics from clusters and categorize them
  const topics = await createTopicsFromClusters(clusters, categories);

  return topics;
}

// Legacy function name for backward compatibility
const categorizeAndGroup = clusterAndCategorize;

module.exports = {
  clusterAndCategorize,
  categorizeAndGroup, // Legacy alias
  clusterNewsItems,
  createTopicsFromClusters,
  getActiveCategories,
  findSimilarItems,
  SIMILARITY_THRESHOLD
};
