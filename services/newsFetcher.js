// services/newsFetcher.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { subHours, subDays } = require('date-fns');
const NewsItem = require('../models/NewsItem');
const FeedSource = require('../models/FeedSource');
const { findUserByIdOrName } = require('../utils/userHelper');
const { generateEmbeddings, getNewsEmbeddingText, isAvailable: isEmbeddingAvailable, getDiagnostics, initializeModel: ensureEmbeddingReady } = require('./embedding');

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['media:content', 'media:thumbnail']
  }
});

// Parse timeframe string to Date
function parseTimeframe(timeframe) {
  const now = new Date();
  switch (timeframe) {
    case '24h':
      return subHours(now, 24);
    case '7d':
      return subDays(now, 7);
    case '30d':
      return subDays(now, 30);
    default:
      return subHours(now, 24);
  }
}

// Fetch RSS feed. Throws on fetch error so callers can distinguish failure from empty feed.
async function fetchRSSFeed(url, sourceName, priority) {
  const feed = await parser.parseURL(url);
  const items = [];
  for (const item of feed.items) {
    try {
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      const newsItem = {
        title: item.title || 'Untitled',
        description: item.contentSnippet || item.content || '',
        content: item.content || '',
        url: item.link || '',
        source: {
          type: 'rss',
          name: sourceName,
          url: url,
          priority: priority
        },
        publishedAt: pubDate,
        metadata: {
          author: item.creator || item.author || '',
          imageUrl: item.enclosure?.url || item['media:content']?.$?.url || ''
        }
      };
      items.push(newsItem);
    } catch (err) {
      console.error(`Error processing RSS item: ${err.message}`);
    }
  }
  return items;
}

// Fetch from web URL (scraping). Throws on fetch error.
async function fetchWebPage(url, sourceName, priority) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const $ = cheerio.load(response.data);
  const title = $('title').text() || $('h1').first().text() || 'Untitled';
  const description = $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || '';
  const content = $('article').text() || $('main').text() || '';
  return {
    title: title.trim(),
    description: description.trim(),
    content: content.substring(0, 5000).trim(),
    url: url,
    source: {
      type: 'web',
      name: sourceName,
      url: url,
      priority: priority
    },
    publishedAt: new Date(),
    metadata: {
      imageUrl: $('meta[property="og:image"]').attr('content') || ''
    }
  };
}

// Fetch news for user within timeframe
// useAllSources: when true, ignore user preferences and use all active FeedSources from DB
async function fetchNewsForUser(userId, timeframe = '24h', useAllSources = false) {
  const user = await findUserByIdOrName(userId);
  if (!user) {
    throw new Error('User not found');
  }
  const sinceDate = parseTimeframe(timeframe);
  const allItems = [];

  // Get sources: use global FeedSources when useAllSources, else user preferences, else global
  let sources = [];
  let fromUserPrefs = false;
  if (useAllSources) {
    sources = (await FeedSource.find({ isActive: true })).map(s => ({
      type: s.type,
      url: s.url,
      name: s.name,
      priority: 5
    }));
  } else {
    sources = user.preferences?.sources || [];
    fromUserPrefs = sources.length > 0;
    if (sources.length === 0) {
      const globalSources = await FeedSource.find({ isActive: true });
      sources = globalSources.map(s => ({
        type: s.type,
        url: s.url,
        name: s.name,
        priority: 5
      }));
    }
  }

  const totalSources = sources.length;
  let successCount = 0;
  let failedCount = 0;
  const failedSources = [];

  // Sort by priority (higher priority first)
  const sortedSources = [...sources].sort((a, b) => (b.priority || 5) - (a.priority || 5));

  for (const source of sortedSources) {
    const sourceName = source.name || source.url;
    try {
      let items = [];
      if (source.type === 'rss' && source.url) {
        items = await fetchRSSFeed(source.url, sourceName, source.priority || 5);
      } else if ((source.type === 'website' || source.type === 'scraper') && source.url) {
        const item = await fetchWebPage(source.url, sourceName, source.priority || 5);
        if (item) items = [item];
      } else if (source.url) {
        failedCount++;
        failedSources.push(`${sourceName} (unsupported type: ${source.type})`);
        continue;
      }

      items = items.filter(item => item.publishedAt >= sinceDate);
      allItems.push(...items);
      successCount++;
    } catch (error) {
      failedCount++;
      failedSources.push(sourceName);
    }
  }

  console.log(`📡 Fetched from ${totalSources} sources: ${successCount} succeeded, ${failedCount} failed (${fromUserPrefs ? 'user-configured' : 'global FeedSource DB'})`);
  if (failedSources.length > 0) {
    console.log(`   Failed: ${failedSources.join(', ')}`);
  }
  
  // Remove duplicates by URL
  const uniqueItems = [];
  const seenUrls = new Set();
  
  for (const item of allItems) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueItems.push(item);
    }
  }
  
  // Save to database with embeddings
  const savedItems = [];
  const newItems = []; // Track items that need embeddings
  
  // First pass: save items without embeddings
  for (const item of uniqueItems) {
    try {
      const existing = await NewsItem.findOne({ url: item.url });
      if (!existing) {
        const newsItem = await NewsItem.create(item);
        savedItems.push(newsItem);
        newItems.push(newsItem);
      } else {
        savedItems.push(existing);
        // Add existing items without embeddings to the list
        if (!existing.embedding || existing.embedding.length === 0) {
          newItems.push(existing);
        }
      }
    } catch (error) {
      console.error(`Error saving news item: ${error.message}`);
    }
  }
  
  // Second pass: generate embeddings for new items (batched for throughput)
  if (newItems.length > 0) {
    const embeddingAvailable = await isEmbeddingAvailable();
    if (embeddingAvailable) {
      const toEmbed = [];
      for (const item of newItems) {
        try {
          toEmbed.push({ item, text: getNewsEmbeddingText(item) });
        } catch (error) {
          console.error(`   ⚠️ Skipping embedding for "${(item.title || '').substring(0, 50)}...": ${error.message}`);
        }
      }
      if (toEmbed.length > 0) {
        console.log(`🧠 Generating embeddings for ${toEmbed.length} news items (batch)...`);
        const texts = toEmbed.map(({ text }) => text);
        const embeddings = await generateEmbeddings(texts);
        await Promise.all(
          toEmbed.map(({ item }, i) => {
            item.embedding = embeddings[i];
            return item.save();
          })
        );
        console.log(`   ✅ Embeddings generated for ${toEmbed.length} items`);
      }
      if (toEmbed.length < newItems.length) {
        console.log(`   ⚠️ ${newItems.length - toEmbed.length} items skipped (no valid text)`);
      }
    } else {
      // Get detailed diagnostic information
      const diagnostics = getDiagnostics();
      console.log(`   ⚠️ Embedding service not available, skipping embedding generation`);
      
      if (diagnostics.status !== 'available') {
        console.log(`   Status: ${diagnostics.status}`);
        if (diagnostics.error) {
          console.log(`   Error: ${diagnostics.error}`);
        }
        if (diagnostics.suggestedFix) {
          console.log(`   Fix: ${diagnostics.suggestedFix}`);
        }
      }
    }
  }
  
  return savedItems;
}

// Resolve feed type for fetcher: 'scraper' -> 'website'
function resolveFeedType(type) {
  return type === 'scraper' ? 'website' : type;
}

// Fetch from a single FeedSource doc and return items (no save)
async function fetchFromFeedSource(source) {
  const type = resolveFeedType(source.type);
  const name = source.name || source.url;
  const priority = 5;
  let items = [];
  if (type === 'rss' && source.url) {
    items = await fetchRSSFeed(source.url, name, priority);
  } else if ((type === 'website' || type === 'scraper') && source.url) {
    const item = await fetchWebPage(source.url, name, priority);
    if (item) items = [item];
  }
  return items;
}

// Save items to DB and generate embeddings; returns saved items
async function saveAndEmbedNewsItems(uniqueItems) {
  const savedItems = [];
  const newItems = [];
  for (const item of uniqueItems) {
    try {
      const existing = await NewsItem.findOne({ url: item.url });
      if (!existing) {
        const newsItem = await NewsItem.create(item);
        savedItems.push(newsItem);
        newItems.push(newsItem);
      } else {
        savedItems.push(existing);
        if (!existing.embedding || existing.embedding.length === 0) {
          newItems.push(existing);
        }
      }
    } catch (error) {
      console.error(`Error saving news item: ${error.message}`);
    }
  }
  if (newItems.length > 0) {
    const embeddingAvailable = await isEmbeddingAvailable();
    if (embeddingAvailable) {
      const toEmbed = [];
      for (const item of newItems) {
        try {
          toEmbed.push({ item, text: getNewsEmbeddingText(item) });
        } catch (error) {
          console.error(`   ⚠️ Skipping embedding for "${(item.title || '').substring(0, 50)}...": ${error.message}`);
        }
      }
      if (toEmbed.length > 0) {
        console.log(`🧠 Generating embeddings for ${toEmbed.length} news items (batch)...`);
        const texts = toEmbed.map(({ text }) => text);
        const embeddings = await generateEmbeddings(texts);
        await Promise.all(
          toEmbed.map(({ item }, i) => {
            item.embedding = embeddings[i];
            return item.save();
          })
        );
        console.log(`   ✅ Embeddings generated for ${toEmbed.length} items`);
      }
    }
  }
  return savedItems;
}

// Fetch from all active global feed sources (for scheduler / admin). Updates each source's lastFetched.
async function fetchNewsFromAllActiveSources() {
  await ensureEmbeddingReady();
  const sources = await FeedSource.find({ isActive: true });
  const allItems = [];
  let successCount = 0;
  let failedCount = 0;
  const failedSources = [];

  for (const source of sources) {
    const sourceName = source.name || source.url;
    try {
      const items = await fetchFromFeedSource(source);
      allItems.push(...items);
      await FeedSource.findByIdAndUpdate(source._id, { lastFetched: new Date() });
      successCount++;
    } catch (error) {
      failedCount++;
      failedSources.push(sourceName);
    }
  }

  console.log(`📡 Fetched from ${sources.length} sources: ${successCount} succeeded, ${failedCount} failed`);
  if (failedSources.length > 0) {
    console.log(`   Failed: ${failedSources.join(', ')}`);
  }

  const seenUrls = new Set();
  const uniqueItems = allItems.filter((item) => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });
  const savedItems = await saveAndEmbedNewsItems(uniqueItems);
  return {
    count: savedItems.length,
    sourcesProcessed: sources.length,
    successCount,
    failedCount,
    failedSources
  };
}

// Fetch from a single feed source by id (for admin "fetch this source" button). Updates source's lastFetched.
async function fetchNewsFromSource(sourceId) {
  await ensureEmbeddingReady();
  const source = await FeedSource.findById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  const items = await fetchFromFeedSource(source);
  await FeedSource.findByIdAndUpdate(sourceId, { lastFetched: new Date() });
  const savedItems = await saveAndEmbedNewsItems(items);
  return { count: savedItems.length };
}

module.exports = {
  fetchNewsForUser,
  fetchRSSFeed,
  parseTimeframe,
  fetchNewsFromAllActiveSources,
  fetchNewsFromSource
};
