// services/agenticWriter/index.js
const WriterJob = require('../../models/WriterJob');
const Article = require('../../models/Article');
const Topic = require('../../models/Topic');
const SocialPost = require('../../models/SocialPost');
const SavedUrlArticle = require('../../models/SavedUrlArticle');
const { compiledGraph } = require('./graph');

/**
 * Run the article-writing graph for a job (fire-and-forget).
 * Loads job; for topic jobs loads topic + newsItems, for social-post jobs builds synthetic topic + single newsItem from post.
 * Invokes graph, creates Article on success or sets job.error on failure.
 * @param {string|ObjectId} jobId - WriterJob._id
 */
async function runArticleGraph(jobId) {
  let job;
  try {
    job = await WriterJob.findById(jobId).exec();
    if (!job) {
      console.error(`[agenticWriter] Job not found: ${jobId}`);
      return;
    }
    await job.updateOne({ status: 'running' }).exec();
  } catch (err) {
    console.error('[agenticWriter] Failed to load job:', err.message);
    if (err.stack) console.error('[agenticWriter] Stack:', err.stack);
    return;
  }

  let topicPlain;
  let newsItems = [];
  let sourceTopicId = null;
  let sourceSocialPostId = null;
  let sourceUrlArticleId = null;
  let sourceNewsItemIds = [];

  if (job.urlArticleId) {
    try {
      const urlArticle = await SavedUrlArticle.findById(job.urlArticleId).exec();
      if (!urlArticle) {
        await job.updateOne({ status: 'failed', error: 'URL article not found' }).exec();
        return;
      }
      const title = (urlArticle.title && urlArticle.title.trim()) || urlArticle.url || '連結文章';
      topicPlain = {
        title,
        summary: urlArticle.description || '',
        category: urlArticle.siteName || '連結',
        tags: []
      };
      newsItems = [{
        title: urlArticle.title || title,
        description: urlArticle.description || '',
        content: urlArticle.description || '',
        url: urlArticle.url || ''
      }];
      sourceUrlArticleId = job.urlArticleId;
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

  const defaultOptions = {
    tone: 'neutral',
    length: 'medium',
    language: 'zh-TW',
    articleType: '懶人包',
    extraInstructions: '',
    publication: 'LiteNews',
    maxResearchArticles: 8
  };
  const options = { ...defaultOptions, ...(job.options || {}) };

  console.log('[agenticWriter] Invoking graph for job', jobId, 'topic:', topicPlain?.title);
  try {
    const result = await compiledGraph.invoke({
      topic: topicPlain,
      newsItems,
      options,
      researchResults: null,
      outline: null,
      rawDraft: null,
      revisedDraft: null,
      factCheckResults: null,
      factCheckScore: null,
      styleNotes: null,
      finalReview: null,
      readyForPublish: null,
      finalArticle: null,
      error: null
    });

    const finalArticle = result.finalArticle;
    if (!finalArticle || !finalArticle.title) {
      await job.updateOne({ status: 'failed', error: 'Graph did not produce finalArticle' }).exec();
      return;
    }

    const seenUrls = new Set();
    const references = [];
    (result.newsItems || []).forEach((item) => {
      const url = item.url && item.url.trim();
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        references.push({ title: (item.title && item.title.trim()) || url, url });
      }
    });
    (result.researchResults || []).forEach((item) => {
      const url = item.url && item.url.trim();
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        references.push({ title: (item.title && item.title.trim()) || url, url });
      }
    });

    const article = await Article.create({
      title: finalArticle.title,
      body: finalArticle.body || '',
      status: 'draft',
      references,
      sourceTopicId: sourceTopicId || null,
      sourceSocialPostId: sourceSocialPostId || null,
      sourceUrlArticleId: sourceUrlArticleId || null,
      sourceNewsItemIds,
      createdBy: job.userId
    });

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
    const errorDetail = err.message + (status != null ? ` (HTTP ${status})` : '') + (responseData?.error ? ` — ${responseData.error}` : '');
    await job.updateOne({
      status: 'failed',
      error: errorDetail.length > 500 ? errorDetail.slice(0, 497) + '…' : errorDetail
    }).exec();
  }
}

module.exports = { runArticleGraph };
