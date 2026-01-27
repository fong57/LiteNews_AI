// services/newsFetcher.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { subHours, subDays } = require('date-fns');
const NewsItem = require('../models/NewsItem');
const FeedSource = require('../models/FeedSource');
const { findUserByIdOrName } = require('../utils/userHelper');
const { generateNewsEmbedding, isAvailable: isEmbeddingAvailable, getDiagnostics } = require('./embedding');

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

// Fetch RSS feed
async function fetchRSSFeed(url, sourceName, priority) {
  try {
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
  } catch (error) {
    console.error(`Error fetching RSS feed ${url}:`, error.message);
    return [];
  }
}

// Fetch from web URL (scraping)
async function fetchWebPage(url, sourceName, priority) {
  try {
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
  } catch (error) {
    console.error(`Error fetching web page ${url}:`, error.message);
    return null;
  }
}

// Fetch news for user within timeframe
async function fetchNewsForUser(userId, timeframe = '24h') {
  const user = await findUserByIdOrName(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const sinceDate = parseTimeframe(timeframe);
  const allItems = [];
  
  // Get sources: use user's custom sources if available, otherwise use global FeedSources
  let sources = user.preferences?.sources || [];
  
  if (sources.length === 0) {
    // Fall back to global FeedSources
    console.log('📡 No user sources configured, using global FeedSources...');
    const globalSources = await FeedSource.find({ isActive: true });
    sources = globalSources.map(s => ({
      type: s.type,
      url: s.url,
      name: s.name,
      priority: 5
    }));
    console.log(`   Found ${sources.length} global feed source(s)`);
  }
  
  // Sort by priority (higher priority first)
  const sortedSources = [...sources].sort((a, b) => (b.priority || 5) - (a.priority || 5));
  
  for (const source of sortedSources) {
    try {
      let items = [];
      
      if (source.type === 'rss' && source.url) {
        console.log(`   Fetching RSS: ${source.name || source.url}`);
        items = await fetchRSSFeed(source.url, source.name || source.url, source.priority || 5);
        console.log(`   ✓ Got ${items.length} items from ${source.name || source.url}`);
      } else if (source.type === 'website' && source.url) {
        const item = await fetchWebPage(source.url, source.name || source.url, source.priority || 5);
        if (item) items = [item];
      }
      // Note: Instagram and X would require API integration
      
      // Filter by timeframe
      items = items.filter(item => item.publishedAt >= sinceDate);
      
      allItems.push(...items);
    } catch (error) {
      console.error(`Error fetching from source ${source.url}:`, error.message);
    }
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
  
  // Second pass: generate embeddings for new items
  if (newItems.length > 0) {
    console.log(`🧠 Generating embeddings for ${newItems.length} news items...`);
    
    const embeddingAvailable = await isEmbeddingAvailable();
    if (embeddingAvailable) {
      for (const item of newItems) {
        try {
          const embedding = await generateNewsEmbedding(item);
          item.embedding = embedding;
          await item.save();
        } catch (error) {
          console.error(`   ⚠️ Failed to generate embedding for "${item.title.substring(0, 50)}...": ${error.message}`);
        }
      }
      console.log(`   ✅ Embeddings generated for ${newItems.length} items`);
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

module.exports = {
  fetchNewsForUser,
  fetchRSSFeed,
  parseTimeframe
};
