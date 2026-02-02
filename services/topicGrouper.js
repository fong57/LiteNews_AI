// services/topicGrouper.js
// Restructured: Vector-based clustering with topic-level categorization

const { categorizeTopic, generateTopicMetadata } = require('./llm');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const Category = require('../models/Category');
const { cosineSimilarity, EMBEDDING_DIMENSIONS } = require('./embedding');

// Clustering configuration (link threshold for connected-components)
// Higher = only clearly same-story pairs link (fewer, tighter clusters). Lower = more links, risk of one giant cluster.
const SIMILARITY_THRESHOLD = parseFloat(process.env.CLUSTERING_THRESHOLD) || 0.68;
const MIN_CLUSTER_SIZE = parseInt(process.env.MIN_CLUSTER_SIZE) || 1;
const MAX_CLUSTER_SIZE = parseInt(process.env.MAX_CLUSTER_SIZE) || 20;
const CANDIDATE_LIMIT = parseInt(process.env.CLUSTERING_CANDIDATE_LIMIT, 10) || 50; // per-item similar candidates when building graph
const NUM_CANDIDATES_MULTIPLIER = 20; // numCandidates = min(200, limit * this)
const CLUSTERING_METHOD = (process.env.CLUSTERING_METHOD || 'connected_components').toLowerCase();

/** Env key suffix for method-specific overrides (e.g. CONNECTED_COMPONENTS, GREEDY_AVERAGE). */
function methodEnvKey(method, suffix) {
  const key = method.toUpperCase().replace(/-/g, '_');
  return `CLUSTERING_${key}_${suffix}`;
}

/** Resolve threshold for the current method: CLUSTERING_<METHOD>_THRESHOLD else CLUSTERING_THRESHOLD. */
function getMethodThreshold() {
  const v = process.env[methodEnvKey(CLUSTERING_METHOD, 'THRESHOLD')];
  return v !== undefined && v !== '' ? parseFloat(v) : SIMILARITY_THRESHOLD;
}

/** Resolve candidate limit for the current method: CLUSTERING_<METHOD>_CANDIDATE_LIMIT else CLUSTERING_CANDIDATE_LIMIT. */
function getMethodCandidateLimit() {
  const v = process.env[methodEnvKey(CLUSTERING_METHOD, 'CANDIDATE_LIMIT')];
  return v !== undefined && v !== '' ? parseInt(v, 10) : CANDIDATE_LIMIT;
}

// Helper function to fetch active categories from Category model
async function getActiveCategories() {
  const categoryDocs = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
  const categories = categoryDocs.map(c => c.name);
  return categories.length > 0 ? categories : ['general'];
}

/**
 * Union-Find (disjoint set) for connected-components clustering.
 * Each node is identified by string id (e.g. _id.toString()).
 */
function createUnionFind() {
  const parent = new Map();

  function ensure(id) {
    if (!parent.has(id)) parent.set(id, id);
    return id;
  }

  function find(id) {
    ensure(id);
    const p = parent.get(id);
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }

  function union(a, b) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  }

  return { find, union, getAllIds: () => [...parent.keys()] };
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

  const numCandidates = Math.min(200, limit * NUM_CANDIDATES_MULTIPLIER);
  try {
    // MongoDB Atlas Vector Search aggregation
    const results = await NewsItem.aggregate([
      {
        $vectorSearch: {
          index: 'news_embedding_index',
          path: 'embedding',
          queryVector: newsItem.embedding,
          numCandidates,
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
 * Shared post-process: apply MIN/MAX cluster size and date ordering.
 * @param {Array} rawClusters - Array of { items, itemIds } (may have any size)
 * @param {Array} itemsWithEmbeddings - Full list of items (for singleton fallback)
 * @param {Object} options - { minClusterSize, maxClusterSize }
 * @returns {Array} - Clusters with MIN/MAX applied
 */
function postProcessClusters(rawClusters, itemsWithEmbeddings, options) {
  const { minClusterSize, maxClusterSize } = options;
  const idToItem = new Map(itemsWithEmbeddings.map(item => [item._id.toString(), item]));
  const sortedItemsByDate = [...itemsWithEmbeddings].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
  const idToItemSorted = new Map(sortedItemsByDate.map(item => [item._id.toString(), item]));

  const clusters = [];
  for (const raw of rawClusters) {
    if (raw.items.length < minClusterSize) {
      if (minClusterSize === 1) {
        for (const item of raw.items) {
          clusters.push({ items: [item], itemIds: [item._id] });
        }
      }
      continue;
    }
    const ordered = raw.items
      .slice()
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, maxClusterSize);
    clusters.push({ items: ordered, itemIds: ordered.map(item => item._id) });
  }

  if (minClusterSize > 1) {
    const clusteredIds = new Set();
    for (const c of clusters) {
      for (const id of c.itemIds) clusteredIds.add(id.toString());
    }
    for (const item of itemsWithEmbeddings) {
      if (clusteredIds.has(item._id.toString())) continue;
      clusters.push({ items: [item], itemIds: [item._id] });
    }
  }
  return clusters;
}

/**
 * Cluster by connected-components: edge if sim(A,B) >= threshold; union-find; each component = cluster.
 * @param {Array} itemsWithEmbeddings - Items with valid embeddings
 * @param {Object} options - { threshold, minClusterSize, maxClusterSize, candidateLimit }
 * @returns {Promise<Array>} - Raw clusters (before post-process)
 */
async function clusterByConnectedComponents(itemsWithEmbeddings, options) {
  const { threshold, candidateLimit, getSimilarItems } = options;
  const findSimilar = getSimilarItems || findSimilarItems;
  const idToItem = new Map();
  const batchIdSet = new Set();
  for (const item of itemsWithEmbeddings) {
    const idStr = item._id.toString();
    idToItem.set(idStr, item);
    batchIdSet.add(idStr);
  }
  const uf = createUnionFind();

  for (let i = 0; i < itemsWithEmbeddings.length; i++) {
    const item = itemsWithEmbeddings[i];
    uf.find(item._id.toString());
    const similarItems = await findSimilar(item, candidateLimit);
    for (const similar of similarItems) {
      if (similar.score < threshold) continue;
      const similarIdStr = similar._id.toString();
      if (!batchIdSet.has(similarIdStr)) continue;
      uf.union(item._id.toString(), similarIdStr);
    }
    if ((i + 1) % 10 === 0 || i + 1 === itemsWithEmbeddings.length) {
      console.log(`   Processed ${i + 1}/${itemsWithEmbeddings.length} items`);
    }
  }

  const rootToIds = new Map();
  for (const idStr of batchIdSet) {
    const root = uf.find(idStr);
    if (!rootToIds.has(root)) rootToIds.set(root, []);
    rootToIds.get(root).push(idStr);
  }

  const rawClusters = [];
  for (const [, idList] of rootToIds) {
    const items = idList.map(idStr => idToItem.get(idStr)).filter(Boolean);
    rawClusters.push({ items, itemIds: items.map(item => item._id) });
  }
  return rawClusters;
}

/**
 * Cluster by greedy seed + average similarity: add item only if avg similarity to all members >= threshold.
 * @param {Array} itemsWithEmbeddings - Items with valid embeddings
 * @param {Object} options - { threshold, minClusterSize, maxClusterSize, candidateLimit }
 * @returns {Promise<Array>} - Raw clusters
 */
async function clusterByGreedyAverage(itemsWithEmbeddings, options) {
  const { threshold, candidateLimit, getSimilarItems } = options;
  const findSimilar = getSimilarItems || findSimilarItems;
  const clusteredIds = new Set();
  const sortedItems = [...itemsWithEmbeddings].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
  const rawClusters = [];
  let processed = 0;

  for (const seedItem of sortedItems) {
    if (clusteredIds.has(seedItem._id.toString())) continue;
    processed++;
    const clusterItems = [seedItem];
    const similarItems = await findSimilar(seedItem, candidateLimit);
    for (const similar of similarItems) {
      if (clusteredIds.has(similar._id.toString())) continue;
      if (clusterItems.length >= options.maxClusterSize) break;
      if (!similar.embedding || similar.embedding.length === 0) continue;
      let sumSim = 0;
      for (const member of clusterItems) {
        if (!member.embedding || member.embedding.length === 0) continue;
        sumSim += cosineSimilarity(similar.embedding, member.embedding);
      }
      const avgSim = clusterItems.length > 0 ? sumSim / clusterItems.length : 0;
      if (avgSim >= threshold) {
        clusterItems.push(similar);
      }
    }
    rawClusters.push({
      items: clusterItems,
      itemIds: clusterItems.map(item => item._id)
    });
    clusterItems.forEach(item => clusteredIds.add(item._id.toString()));
    if (processed % 10 === 0 || processed === sortedItems.length) {
      console.log(`   Built ${processed} clusters (greedy_average)`);
    }
  }

  const unclustered = sortedItems.filter(item => !clusteredIds.has(item._id.toString()));
  for (const item of unclustered) {
    rawClusters.push({ items: [item], itemIds: [item._id] });
  }
  return rawClusters;
}

/**
 * Cluster by greedy seed + min similarity: add item only if min similarity to any member >= threshold.
 * @param {Array} itemsWithEmbeddings - Items with valid embeddings
 * @param {Object} options - { threshold, minClusterSize, maxClusterSize, candidateLimit }
 * @returns {Promise<Array>} - Raw clusters
 */
async function clusterByGreedyMin(itemsWithEmbeddings, options) {
  const { threshold, candidateLimit, getSimilarItems } = options;
  const findSimilar = getSimilarItems || findSimilarItems;
  const clusteredIds = new Set();
  const sortedItems = [...itemsWithEmbeddings].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
  const rawClusters = [];
  let processed = 0;

  for (const seedItem of sortedItems) {
    if (clusteredIds.has(seedItem._id.toString())) continue;
    processed++;
    const clusterItems = [seedItem];
    const similarItems = await findSimilar(seedItem, candidateLimit);
    for (const similar of similarItems) {
      if (clusteredIds.has(similar._id.toString())) continue;
      if (clusterItems.length >= options.maxClusterSize) break;
      if (!similar.embedding || similar.embedding.length === 0) continue;
      let minSim = 1;
      for (const member of clusterItems) {
        if (!member.embedding || member.embedding.length === 0) continue;
        const sim = cosineSimilarity(similar.embedding, member.embedding);
        if (sim < minSim) minSim = sim;
      }
      if (minSim >= threshold) {
        clusterItems.push(similar);
      }
    }
    rawClusters.push({
      items: clusterItems,
      itemIds: clusterItems.map(item => item._id)
    });
    clusterItems.forEach(item => clusteredIds.add(item._id.toString()));
    if (processed % 10 === 0 || processed === sortedItems.length) {
      console.log(`   Built ${processed} clusters (greedy_min)`);
    }
  }

  const unclustered = sortedItems.filter(item => !clusteredIds.has(item._id.toString()));
  for (const item of unclustered) {
    rawClusters.push({ items: [item], itemIds: [item._id] });
  }
  return rawClusters;
}

/**
 * Cluster by mutual top-k: edge only if A in B's top-k and B in A's top-k; then connected components.
 * @param {Array} itemsWithEmbeddings - Items with valid embeddings
 * @param {Object} options - { threshold, minClusterSize, maxClusterSize, candidateLimit }
 * @returns {Promise<Array>} - Raw clusters
 */
async function clusterByMutualK(itemsWithEmbeddings, options) {
  const { threshold, candidateLimit } = options;
  const idToItem = new Map();
  const batchIdSet = new Set();
  for (const item of itemsWithEmbeddings) {
    const idStr = item._id.toString();
    idToItem.set(idStr, item);
    batchIdSet.add(idStr);
  }

  const findSimilar = options.getSimilarItems || findSimilarItems;
  const topKPerId = new Map();
  for (let i = 0; i < itemsWithEmbeddings.length; i++) {
    const item = itemsWithEmbeddings[i];
    const similarItems = await findSimilar(item, candidateLimit);
    const inBatch = similarItems
      .filter(s => batchIdSet.has(s._id.toString()) && s.score >= threshold)
      .slice(0, candidateLimit)
      .map(s => s._id.toString());
    topKPerId.set(item._id.toString(), new Set(inBatch));
    if ((i + 1) % 10 === 0 || i + 1 === itemsWithEmbeddings.length) {
      console.log(`   Processed ${i + 1}/${itemsWithEmbeddings.length} items (mutual_k)`);
    }
  }

  console.log(`   Building connected components from mutual top-k...`);
  const uf = createUnionFind();
  for (const item of itemsWithEmbeddings) {
    const idStr = item._id.toString();
    uf.find(idStr);
    const topK = topKPerId.get(idStr);
    if (!topK) continue;
    for (const otherIdStr of topK) {
      const otherTopK = topKPerId.get(otherIdStr);
      if (otherTopK && otherTopK.has(idStr)) {
        uf.union(idStr, otherIdStr);
      }
    }
  }

  const rootToIds = new Map();
  for (const idStr of batchIdSet) {
    const root = uf.find(idStr);
    if (!rootToIds.has(root)) rootToIds.set(root, []);
    rootToIds.get(root).push(idStr);
  }

  const rawClusters = [];
  for (const [, idList] of rootToIds) {
    const items = idList.map(idStr => idToItem.get(idStr)).filter(Boolean);
    rawClusters.push({ items, itemIds: items.map(item => item._id) });
  }
  return rawClusters;
}

const CLUSTERING_METHODS = {
  connected_components: clusterByConnectedComponents,
  greedy_average: clusterByGreedyAverage,
  greedy_min: clusterByGreedyMin,
  mutual_k: clusterByMutualK
};

/**
 * Cluster news items by the configured method; apply shared post-process.
 * @param {Array} newsItems - Array of news items to cluster
 * @returns {Promise<Array>} - Array of clusters (each cluster is { items, itemIds })
 */
async function clusterNewsItems(newsItems) {
  const itemsWithEmbeddings = newsItems.filter(
    item => item.embedding && item.embedding.length === EMBEDDING_DIMENSIONS
  );

  if (itemsWithEmbeddings.length === 0) {
    console.log('   ⚠️ No items with embeddings found, skipping clustering');
    return [];
  }

  const method = CLUSTERING_METHODS[CLUSTERING_METHOD] || CLUSTERING_METHODS.connected_components;
  console.log(`📊 Clustering ${newsItems.length} news items (method: ${CLUSTERING_METHOD})...`);
  console.log(`   ${itemsWithEmbeddings.length} items have embeddings`);
  const clusterStartMs = Date.now();

  const options = {
    threshold: getMethodThreshold(),
    minClusterSize: MIN_CLUSTER_SIZE,
    maxClusterSize: MAX_CLUSTER_SIZE,
    candidateLimit: getMethodCandidateLimit()
  };

  console.log(`   Building similarity graph (1 query per item, threshold=${options.threshold})...`);
  const rawClusters = await method(itemsWithEmbeddings, options);
  const clusterElapsed = ((Date.now() - clusterStartMs) / 1000).toFixed(1);
  console.log(`   Similarity phase done in ${clusterElapsed}s`);

  const clusters = postProcessClusters(rawClusters, itemsWithEmbeddings, options);
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

  const total = clusters.length;
  console.log(`📝 Creating topics from ${total} clusters...`);

  const topics = [];
  let failedCount = 0;
  const logInterval = total <= 20 ? 1 : total <= 100 ? 10 : 25;

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const current = i + 1;
    if (current === 1 || current % logInterval === 0 || current === total) {
      console.log(`   Creating topic ${current}/${total}...`);
    }
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
      failedCount++;
      const sampleTitle = (cluster.items[0] && cluster.items[0].title)
        ? cluster.items[0].title.slice(0, 50) + (cluster.items[0].title.length > 50 ? '...' : '')
        : '(no title)';
      console.error(`   ❌ Error creating topic ${current}/${total} (cluster with "${sampleTitle}"):`, error.message);
      if (error.stack) {
        console.error(`   Stack:`, error.stack.split('\n').slice(1, 3).join('\n'));
      }
    }
  }

  console.log(`   ✅ Created ${topics.length} topics${failedCount > 0 ? `, ${failedCount} failed` : ''}`);
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
  SIMILARITY_THRESHOLD,
  postProcessClusters,
  clusterByConnectedComponents,
  clusterByGreedyAverage,
  clusterByGreedyMin,
  clusterByMutualK,
  CLUSTERING_METHODS,
  CLUSTERING_METHOD
};
