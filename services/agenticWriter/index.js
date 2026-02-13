// services/agenticWriter/index.js
/**
 * These lines import Mongoose models (for MongoDB data access) and a precompiled workflow graph (the AI writing logic).
 */
const WriterJob = require('../../models/WriterJob'); // Import WriterJob model (database schema for writing jobs)
const Article = require('../../models/Article'); // Import Article model (schema for generated articles)
const Topic = require('../../models/Topic'); // Import Topic model (schema for writing topics)
const SocialPost = require('../../models/SocialPost'); // Import SocialPost model (schema for social media posts)
const SavedUrlArticle = require('../../models/SavedUrlArticle'); // Import SavedUrlArticle model (schema for articles saved from URLs)
const { compiledGraph } = require('./graph');  // Import precompiled workflow graph (core logic for article generation)

/**
 * Run the article-writing graph for a job (fire-and-forget).
 * Loads job; for topic jobs loads topic + newsItems, for social-post jobs builds synthetic topic + single newsItem from post.
 * Invokes graph, creates Article on success or sets job.error on failure.
 * @param {string|ObjectId} jobId - WriterJob._id
 */
async function runArticleGraph(jobId) {
  let job; // Declare variable to store the job data. This will be populated with the job details from the database.
  try {
    job = await WriterJob.findById(jobId).exec(); // Find the job by its ID in the database.
    if (!job) { // If job not found
      console.error(`[agenticWriter] Job not found: ${jobId}`);
      return; // Exit the function if job not found.
    }
    await job.updateOne({ status: 'running' }).exec(); // Update the job status to 'running' in the database.
  } catch (err) {
    console.error('[agenticWriter] Failed to load job:', err.message);
    if (err.stack) console.error('[agenticWriter] Stack:', err.stack); // Log the stack trace if available.
    return; // Exit the function if job not found.
  }

  let topicPlain; // Plain object (not Mongoose document) for topic data
  let newsItems = []; // List of news items to use for writing
  let sourceTopicId = null; // Source Topic ID (if job uses a Topic)
  let sourceSocialPostId = null; // Source Topic ID (if job uses a Topic)
  let sourceUrlArticleId = null; // Source SavedUrlArticle ID (if job uses a URL article)
  let sourceNewsItemIds = []; // List of source news item IDs (from Topic)

  if (job.urlArticleId) { // If job has a urlArticleId (source = saved URL article)
    try {
      const urlArticle = await SavedUrlArticle.findById(job.urlArticleId).exec(); // Fetch URL article from DB
      if (!urlArticle) { // If URL article not found
        await job.updateOne({ status: 'failed', error: 'URL article not found' }).exec(); // Mark job as failed
        return; // Exit
      }
      const title = (urlArticle.title && urlArticle.title.trim()) || urlArticle.url || '連結文章'; // Get title from URL (fallback to URL or "連結文章" if empty)
      topicPlain = { // Build topicPlain (standardized topic object for the graph)
        title,
        summary: urlArticle.description || '', // Get summary from URL article
        category: urlArticle.siteName || '連結', // Get category from URL article
        tags: [] // Get tags from URL article
      };
      newsItems = [{
        title: urlArticle.title || title, // Get title from URL article
        description: urlArticle.description || '', // Get description from URL article
        content: urlArticle.description || '', // Get content from URL article
        url: urlArticle.url || '' // Get URL from URL article
      }];
      sourceUrlArticleId = job.urlArticleId; // Set source URL article ID
    } catch (err) {
      await job.updateOne({ status: 'failed', error: err.message }).exec();
      return;
    }
  } else if (job.socialPostId) {
    try {
      const post = await SocialPost.findById(job.socialPostId).exec();
      if (!post) {
        await job.updateOne({ status: 'failed', error: 'Social post not found' }).exec();
        return;
      }
      const title = (post.title && post.title.trim()) || (post.content && post.content.slice(0, 80).trim()) || '社交貼文';
      topicPlain = {
        title,
        summary: post.content || post.description || '',
        category: post.platform || 'social',
        tags: []
      };
      newsItems = [{
        title: post.title || title,
        description: post.description || '',
        content: post.content || '',
        url: post.url || ''
      }];
      sourceSocialPostId = job.socialPostId;
    } catch (err) {
      await job.updateOne({ status: 'failed', error: err.message }).exec();
      return;
    }
  } else {
    let topic;
    try {
      topic = await Topic.findById(job.topicId).populate('newsItems').exec();
      if (!topic) {
        await job.updateOne({ status: 'failed', error: 'Topic not found' }).exec();
        return;
      }
      const rawItems = topic.newsItems || [];
      newsItems = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
      newsItems = newsItems.map((item) => ({
        title: item.title,
        description: item.description,
        content: item.content,
        url: item.url
      }));
      topicPlain = {
        title: topic.title,
        summary: topic.summary,
        category: topic.category,
        tags: topic.tags || []
      };
      sourceTopicId = job.topicId;
      sourceNewsItemIds = (topic.newsItems || []).map((n) => n._id).filter(Boolean);
    } catch (err) {
      await job.updateOne({ status: 'failed', error: err.message }).exec();
      return;
    }
  }
  // Default writing options (fallbacks)
  const defaultOptions = {
    tone: 'neutral',
    length: 800,
    language: 'zh-TW',
    articleType: '懶人包',
    extraInstructions: '',
    publication: 'LiteNews',
    maxResearchArticles: 15 // Default max articles to 15 if not specified in options
  };
  // Merge default options with job-specific options (job.options overrides defaults)
  const options = { ...defaultOptions, ...(job.options || {}) };

  // Log the job details and topic title
  console.log('[agenticWriter] Invoking graph for job', jobId, 'topic:', topicPlain?.title);
  const initialState = {
    topic: topicPlain,
    newsItems,
    options,
    researchResults: null,
    outline: null,
    rawDraft: null,
    revisedDraft: null,
    revisionHistory: [],
    factCheckResults: null,
    factCheckScore: null,
    styleNotes: null,
    finalReview: null,
    finalReviewHistory: [],
    readyForPublish: null,
    finalArticle: null,
    error: null
  };
  const maxAttempts = 2;
  let result;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) console.log('[agenticWriter] Retry attempt', attempt);
        result = await compiledGraph.invoke(initialState);
        break;
      } catch (invokeErr) {
        const isConnectionErr =
          /connection error|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i.test(invokeErr.message) ||
          (typeof (invokeErr.cause?.message || invokeErr.cause) === 'string' && /fetch failed|connection/i.test(invokeErr.cause?.message || invokeErr.cause));
        if (isConnectionErr && attempt < maxAttempts) {
          console.warn('[agenticWriter] Connection error, retrying in 3s…', invokeErr.message);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw invokeErr;
      }
    }
    if (!result) {
      await job.updateOne({ status: 'failed', error: 'Graph did not produce result' }).exec();
      return;
    }

    const finalArticle = result.finalArticle;
    if (!finalArticle || !finalArticle.title) {
      await job.updateOne({ status: 'failed', error: 'Graph did not produce finalArticle' }).exec();
      return;
    }

    // Create a Set to track unique URLs (avoid duplicate references)
    const seenUrls = new Set();
    const references = []; // List of references (URLs + titles)
    // Add news items to references (unique URLs only)
    (result.newsItems || []).forEach((item) => {
      const url = item.url && item.url.trim(); // Trim URL (remove whitespace)
      if (url && !seenUrls.has(url)) { // If URL exists and not seen before
        seenUrls.add(url); // Mark URL as seen
        // Add to references (title fallback to URL)
        references.push({ title: (item.title && item.title.trim()) || url, url });
      }
    });
    // Add research results to references (unique URLs only)
    (result.researchResults || []).forEach((item) => {
      const url = item.url && item.url.trim();
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        references.push({ title: (item.title && item.title.trim()) || url, url });
      }
    });

    // Create a new Article in the database
    const article = await Article.create({
      title: finalArticle.title, // Title from graph output
      body: finalArticle.body || '', // Article content (fallback to empty string)
      status: 'draft', // Initial status: draft
      references, // Unique references built above
      sourceTopicId: sourceTopicId || null, // Source Topic ID (if job uses a Topic)
      sourceSocialPostId: sourceSocialPostId || null, // Source Social Post ID (if job uses a Social Post)
      sourceUrlArticleId: sourceUrlArticleId || null, // Source URL Article ID (if job uses a URL Article)
      sourceNewsItemIds, // Source News Item IDs (if job uses a Topic)
      createdBy: job.userId // Created by user ID
    });

    // Update the job status to completed in the database
    await job.updateOne({
      status: 'completed',
      articleId: article._id,
      error: null,
      runLog: result
    }).exec();
  } catch (err) {
    const status = err.response?.status;
    const responseData = err.response?.data;
    const cause = err.cause?.message || err.cause;
    console.error('[agenticWriter] Graph error:', err.message);
    if (err.stack) console.error('[agenticWriter] Stack:', err.stack);
    if (status != null) console.error('[agenticWriter] Response status:', status);
    if (responseData != null) console.error('[agenticWriter] Response data:', typeof responseData === 'object' ? JSON.stringify(responseData).slice(0, 1000) : responseData);
    if (cause) console.error('[agenticWriter] Cause:', cause);
    const isConnectionError =
      /connection error|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i.test(err.message) ||
      (typeof cause === 'string' && /fetch failed|connection/i.test(cause));
    const errorDetail = isConnectionError
      ? 'Perplexity API connection failed. Check network, firewall, and PERPLEXITY_API_KEY. ' + (err.message || '')
      : err.message + (status != null ? ` (HTTP ${status})` : '') + (responseData?.error ? ` — ${responseData.error}` : '');
    await job.updateOne({
      status: 'failed',
      error: errorDetail.length > 500 ? errorDetail.slice(0, 497) + '…' : errorDetail
    }).exec();
  }
}

module.exports = { runArticleGraph };
