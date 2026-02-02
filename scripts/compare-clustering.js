#!/usr/bin/env node
// scripts/compare-clustering.js
// Load news items, run all clustering methods with in-memory similarity, print comparison report (no DB writes).

require('dotenv').config();
const mongoose = require('mongoose');
const NewsItem = require('../models/NewsItem');
const { cosineSimilarity, EMBEDDING_DIMENSIONS } = require('../services/embedding');
const {
  postProcessClusters,
  CLUSTERING_METHODS
} = require('../services/topicGrouper');
const { parseTimeframe } = require('../services/newsFetcher');

function parseArgs() {
  const args = process.argv.slice(2);
  let timeframe = '24h';
  let limit = 500;
  for (const arg of args) {
    if (arg.startsWith('--timeframe=')) {
      timeframe = arg.slice('--timeframe='.length);
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.slice('--limit='.length), 10) || 500;
    }
  }
  return { timeframe, limit };
}

/**
 * Build in-memory top-k similar items per item (from the same batch).
 * Returns a function getSimilarItems(item, limit) that resolves to [{ _id, score, embedding, ... }, ...].
 */
function buildInMemorySimilarity(itemsWithEmbeddings, threshold, candidateLimit) {
  const dims = EMBEDDING_DIMENSIONS;
  const topKPerId = new Map();

  for (let i = 0; i < itemsWithEmbeddings.length; i++) {
    const item = itemsWithEmbeddings[i];
    if (!item.embedding || item.embedding.length !== dims) {
      topKPerId.set(item._id.toString(), []);
      continue;
    }
    const scored = [];
    for (let j = 0; j < itemsWithEmbeddings.length; j++) {
      if (i === j) continue;
      const other = itemsWithEmbeddings[j];
      if (!other.embedding || other.embedding.length !== dims) continue;
      const score = cosineSimilarity(item.embedding, other.embedding);
      if (score >= threshold) {
        scored.push({ ...other, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    topKPerId.set(item._id.toString(), scored.slice(0, candidateLimit));
    if ((i + 1) % 100 === 0) {
      console.log(`   Precomputed similarity for ${i + 1}/${itemsWithEmbeddings.length} items`);
    }
  }

  return function getSimilarItems(item, limit) {
    const list = topKPerId.get(item._id.toString()) || [];
    return Promise.resolve(list.slice(0, limit));
  };
}

function sizeDistribution(clusters) {
  const counts = {};
  for (const c of clusters) {
    const n = c.items.length;
    const key = n === 1 ? '1' : n <= 5 ? '2-5' : n <= 10 ? '6-10' : '11+';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function report(name, clusters) {
  const numClusters = clusters.length;
  const singletons = clusters.filter(c => c.items.length === 1).length;
  const maxSize = clusters.length ? Math.max(...clusters.map(c => c.items.length)) : 0;
  const dist = sizeDistribution(clusters);
  const distStr = Object.entries(dist)
    .sort((a, b) => {
      const order = ['1', '2-5', '6-10', '11+'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  console.log(`\n--- ${name} ---`);
  console.log(`  Clusters: ${numClusters}`);
  console.log(`  Singletons: ${singletons}`);
  console.log(`  Max cluster size: ${maxSize}`);
  console.log(`  Size distribution: ${distStr}`);
  const samples = clusters.slice(0, 3);
  if (samples.length) {
    console.log('  Sample (first item title per cluster):');
    samples.forEach((c, i) => {
      const title = (c.items[0] && c.items[0].title) ? c.items[0].title.slice(0, 60) : '(none)';
      console.log(`    ${i + 1}. [${c.items.length} items] ${title}${title.length >= 60 ? '...' : ''}`);
    });
  }
}

async function main() {
  const { timeframe, limit } = parseArgs();
  console.log('Compare clustering methods (in-memory similarity, no DB writes)\n');
  console.log(`Options: timeframe=${timeframe}, limit=${limit}`);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  const sinceDate = parseTimeframe(timeframe);
  const items = await NewsItem.find({ publishedAt: { $gte: sinceDate } })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();

  const itemsWithEmbeddings = items.filter(
    item => item.embedding && item.embedding.length === EMBEDDING_DIMENSIONS
  );

  if (itemsWithEmbeddings.length === 0) {
    console.log('No items with embeddings in the selected range. Fetch news and run process first.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Loaded ${items.length} items, ${itemsWithEmbeddings.length} with embeddings\n`);

  const threshold = parseFloat(process.env.CLUSTERING_THRESHOLD) || 0.68;
  const minClusterSize = parseInt(process.env.MIN_CLUSTER_SIZE, 10) || 1;
  const maxClusterSize = parseInt(process.env.MAX_CLUSTER_SIZE, 10) || 20;
  const candidateLimit = parseInt(process.env.CLUSTERING_CANDIDATE_LIMIT, 10) || 50;

  console.log('Building in-memory similarity (top-k per item)...');
  const getSimilarItems = buildInMemorySimilarity(itemsWithEmbeddings, threshold, candidateLimit);

  const options = {
    threshold,
    minClusterSize,
    maxClusterSize,
    candidateLimit,
    getSimilarItems
  };

  for (const [methodName, fn] of Object.entries(CLUSTERING_METHODS)) {
    console.log(`\nRunning ${methodName}...`);
    const rawClusters = await fn(itemsWithEmbeddings, options);
    const clusters = postProcessClusters(rawClusters, itemsWithEmbeddings, options);
    report(methodName, clusters);
  }

  console.log('\nDone. Set CLUSTERING_METHOD in .env to the method that looks best and run process.\n');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
