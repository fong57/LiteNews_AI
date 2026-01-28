// services/socialFeedFetcher/facebook.js
const axios = require('axios');

const SOCIAVAULT_API_BASE = 'https://api.sociavault.com/v1/scrape';
const LOG_PREFIX = '[Facebook]';

// Configuration constants
const MAX_REQUESTS = 10; // Maximum number of pagination requests to prevent excessive API calls
const DELAY_BETWEEN_REQUESTS_MS = 1500; // Delay between pagination requests to avoid rate limits
const MAX_RETRIES = 3; // Maximum retries for 502/503 errors
const RETRY_DELAY_MS = 2000; // Delay before retrying on error
const MIN_POSTS_PER_PAGE = 2; // If we get fewer posts than this, likely hitting rate limits

/**
 * Get SociaVault API key from environment
 */
function getApiKey() {
  const apiKey = process.env.SOCIAVAULT_API_KEY;
  if (!apiKey) {
    throw new Error('SOCIAVAULT_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Delay helper for rate limiting and retries
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build API params: Facebook profile posts accept either url or pageId
 */
function buildParams(handle, cursor) {
  const trimmed = (handle || '').trim();
  const isUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes('facebook.com');
  const params = {};
  if (isUrl) {
    params.url = trimmed.indexOf('http') === 0 ? trimmed : `https://www.facebook.com/${trimmed.replace(/^\/+/, '')}`;
  } else {
    params.pageId = trimmed;
  }
  if (cursor) {
    params.cursor = cursor;
  }
  return params;
}

/**
 * Make a single API request with retry logic for transient errors
 */
async function makeRequestWithRetry(requestUrl, requestParams, apiKey, attempt = 1) {
  try {
    const response = await axios.get(requestUrl, {
      params: requestParams,
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'LiteNews_AI/1.0'
      },
      timeout: 60000
    });
    return { success: true, response };
  } catch (error) {
    const status = error.response?.status;
    const isRetryable = status === 502 || status === 503 || status === 504;
    
    if (isRetryable && attempt < MAX_RETRIES) {
      console.log(`${LOG_PREFIX} retryable error (${status}) on attempt ${attempt}/${MAX_RETRIES}, retrying in ${RETRY_DELAY_MS}ms...`);
      await delay(RETRY_DELAY_MS * attempt); // Exponential backoff
      return makeRequestWithRetry(requestUrl, requestParams, apiKey, attempt + 1);
    }
    
    return { success: false, error };
  }
}

/**
 * Fetch profile posts from Facebook (posts only)
 * Optimized to reduce API calls and handle rate limits gracefully
 */
async function getPosts(handle, limit = 20) {
  const apiKey = getApiKey();
  const initialParams = buildParams(handle, null);
  console.log(`${LOG_PREFIX} getPosts start | handle="${handle}" | limit=${limit} | params=${JSON.stringify(initialParams)} | endpoint=${SOCIAVAULT_API_BASE}/facebook/profile/posts`);

  const objectToArray = (obj) => {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    if (typeof obj !== 'object') return [];
    const keys = Object.keys(obj).filter((k) => !isNaN(parseInt(k, 10))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return keys.map((k) => obj[k]).filter((item) => item != null);
  };

  const allPosts = [];
  try {
    let cursor = null;
    let requestCount = 0;
    let consecutiveLowCountPages = 0; // Track if we're getting very few posts per page

    do {
      // Enforce maximum request limit to prevent excessive API calls
      if (requestCount >= MAX_REQUESTS) {
        console.warn(`${LOG_PREFIX} reached max requests (${MAX_REQUESTS}), stopping pagination | totalPosts=${allPosts.length}`);
        break;
      }

      requestCount++;
      const requestParams = buildParams(handle, cursor);
      console.log(`${LOG_PREFIX} request #${requestCount} | params=${JSON.stringify(requestParams)}`);
      const requestUrl = `${SOCIAVAULT_API_BASE}/facebook/profile/posts`;

      // Add delay between requests (except for the first one) to avoid rate limits
      if (requestCount > 1) {
        await delay(DELAY_BETWEEN_REQUESTS_MS);
      }

      // Make request with retry logic
      const { success, response, error } = await makeRequestWithRetry(requestUrl, requestParams, apiKey);

      if (!success) {
        // Handle non-retryable errors
        const isAxios = error.response != null;
        const status = isAxios ? error.response.status : null;
        const errorData = isAxios ? error.response.data : null;
        const errorCode = error.code || '';
        const errorMsg = error.message || '';

        console.error(`${LOG_PREFIX} getPosts error | handle="${handle}" | isAxios=${isAxios} | status=${status} | code=${errorCode} | message=${errorMsg}`);
        
        // If we have some posts already, return them instead of failing completely
        if (allPosts.length > 0) {
          console.warn(`${LOG_PREFIX} returning partial results due to error | posts=${allPosts.length} | error=${errorMsg}`);
          return allPosts.slice(0, limit);
        }

        if (errorData) {
          const errStr = typeof errorData === 'string' ? errorData : JSON.stringify(errorData).substring(0, 400);
          console.error(`${LOG_PREFIX} error response body: ${errStr}`);
        }

        if (error.response) {
          const status = error.response.status;
          const errorData = error.response.data;
          let errorMsg = 'Unknown error';
          if (errorData) {
            if (typeof errorData === 'string') errorMsg = errorData;
            else if (errorData.message) errorMsg = errorData.message;
            else if (errorData.error) errorMsg = errorData.error;
            else errorMsg = JSON.stringify(errorData).substring(0, 200);
          } else {
            errorMsg = error.response.statusText;
          }
          if (status === 404) {
            throw new Error(`Facebook profile not found: ${handle}. Please verify the URL or page ID.`);
          }
          if (status === 401 || status === 403) {
            throw new Error('SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.');
          }
          if (status === 402) {
            throw new Error('SociaVault API: Insufficient credits. Please check your account balance.');
          }
          throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
        }
        throw new Error(`Failed to fetch Facebook posts: ${error.message}`);
      }

      const status = response.status;
      const data = response.data;
      const responseKeys = data ? Object.keys(data) : [];
      console.log(`${LOG_PREFIX} response #${requestCount} | status=${status} | responseKeys=[${responseKeys.join(', ')}]`);

      let items = [];
      if (data?.posts) {
        items = objectToArray(data.posts);
        console.log(`${LOG_PREFIX} parsed data.posts | count=${items.length} | type=${Array.isArray(data.posts) ? 'array' : typeof data.posts}`);
      } else if (data?.data?.posts) {
        items = objectToArray(data.data.posts);
        console.log(`${LOG_PREFIX} parsed data.data.posts | count=${items.length}`);
      } else if (Array.isArray(data?.data)) {
        items = data.data;
        console.log(`${LOG_PREFIX} parsed data.data as array | count=${items.length}`);
      } else if (Array.isArray(data)) {
        items = data;
        console.log(`${LOG_PREFIX} parsed response.data as array | count=${items.length}`);
      } else {
        const preview = data ? JSON.stringify(data).substring(0, 300) : 'null';
        console.warn(`${LOG_PREFIX} unexpected response shape | keys=[${responseKeys.join(', ')}] | preview=${preview}`);
      }

      if (!Array.isArray(items)) {
        items = [];
      }

      // Check if we're getting very few posts per page (possible rate limiting)
      if (items.length < MIN_POSTS_PER_PAGE && requestCount > 1) {
        consecutiveLowCountPages++;
        if (consecutiveLowCountPages >= 2) {
          console.warn(`${LOG_PREFIX} getting very few posts per page (${items.length}), likely hitting rate limits. Stopping early. | totalPosts=${allPosts.length}`);
          break;
        }
      } else {
        consecutiveLowCountPages = 0; // Reset counter if we get a good page
      }

      if (items.length > 0) {
        allPosts.push(...items);
      }

      cursor = data?.cursor || data?.data?.cursor || null;
      console.log(`${LOG_PREFIX} page done | itemsThisPage=${items.length} | totalSoFar=${allPosts.length} | hasCursor=${!!cursor}`);

      // Break if we have enough posts or no more pages
      if (allPosts.length >= limit || !cursor) {
        break;
      }
    } while (true);

    const result = allPosts.slice(0, limit);
    if (result.length === 0) {
      console.warn(`${LOG_PREFIX} getPosts done | no posts for handle="${handle}"`);
    } else {
      console.log(`${LOG_PREFIX} getPosts done | handle="${handle}" | posts=${result.length} | requests=${requestCount}`);
    }
    return result;
  } catch (error) {
    // If we have some posts, return them instead of throwing
    if (allPosts && allPosts.length > 0) {
      console.warn(`${LOG_PREFIX} returning partial results due to error | posts=${allPosts.length} | error=${error.message}`);
      return allPosts.slice(0, limit);
    }
    throw error;
  }
}

/**
 * Normalize Facebook post to common post format
 */
function normalizePost(post, handle, profileInfo) {
  const content = post.message || post.text || post.content || post.description || '';
  const contentStr = typeof content === 'string' ? content : String(content || '');

  // SociaVault API returns 'publishTime' (Unix seconds); also support Graph API-style fields
  let publishedAt = new Date();
  if (post.publishTime != null) {
    publishedAt = new Date(typeof post.publishTime === 'number' ? post.publishTime * 1000 : post.publishTime);
  } else if (post.created_time) {
    publishedAt = new Date(post.created_time);
  } else if (post.timestamp != null) {
    publishedAt = new Date(typeof post.timestamp === 'number' ? post.timestamp * 1000 : post.timestamp);
  } else if (post.created_at) {
    publishedAt = new Date(post.created_at);
  }

  // Log date parsing for debugging
  if (post.publishTime == null && !post.created_time && post.timestamp == null && !post.created_at) {
    console.warn(`${LOG_PREFIX} normalizePost: No date field found in post`, {
      postId: post.id || post.post_id,
      availableKeys: Object.keys(post).filter(k => k.toLowerCase().includes('time') || k.toLowerCase().includes('date') || k.toLowerCase().includes('publish'))
    });
  }

  const likeCount = post.like_count ?? post.reactions?.summary?.total_count ?? post.likes?.summary?.total_count ?? 0;
  const commentCount = post.comment_count ?? post.comments?.summary?.total_count ?? 0;
  const shareCount = post.shares?.count ?? post.share_count ?? 0;
  const score = (likeCount * 2) + (commentCount * 0.5) + (shareCount * 1.5);

  const mediaUrls = [];
  if (post.full_picture) mediaUrls.push(post.full_picture);
  if (post.picture) mediaUrls.push(post.picture);
  if (post.attachments?.data) {
    const att = post.attachments.data;
    const arr = Array.isArray(att) ? att : [att];
    arr.forEach((a) => {
      if (a.media?.image?.src) mediaUrls.push(a.media.image.src);
      if (a.subattachments?.data) {
        (a.subattachments.data || []).forEach((s) => {
          if (s.media?.image?.src) mediaUrls.push(s.media.image.src);
        });
      }
    });
  }

  let url = post.permalink_url || post.url || '';
  if (!url && (post.id || post.post_id)) {
    const id = post.id || post.post_id;
    const pageId = post.from?.id || profileInfo?.id || handle;
    url = `https://www.facebook.com/${pageId}/posts/${id}`.replace(/\/posts\/posts/, '/posts/');
  }
  if (!url) {
    url = typeof handle === 'string' && handle.includes('facebook.com') ? handle : `https://www.facebook.com/${handle}`;
  }

  const externalId = post.id || post.post_id || post.permalink_url || url || '';
  const title = post.name || (contentStr.length > 0 ? contentStr.substring(0, 100) : null);

  return {
    platform: 'facebook',
    externalId: String(externalId),
    content: contentStr,
    title,
    description: contentStr.substring(0, 500),
    url,
    publishedAt,
    author: {
      handle: handle,
      displayName: profileInfo?.name || post.from?.name || handle,
      avatarUrl: profileInfo?.picture?.data?.url || post.from?.picture?.data?.url
    },
    engagement: {
      likes: likeCount,
      comments: commentCount,
      reposts: shareCount,
      score
    },
    metadata: {
      mediaUrls: mediaUrls.filter(Boolean),
      tags: []
    }
  };
}

/**
 * Fetch Facebook profile posts for a handle (URL or pageId)
 */
async function fetchFacebookFeed(handle, limit = 20) {
  console.log(`${LOG_PREFIX} fetchFacebookFeed start | handle="${handle}" | limit=${limit}`);
  let postsData;
  try {
    postsData = await getPosts(handle, limit);
  } catch (err) {
    console.error(`${LOG_PREFIX} fetchFacebookFeed getPosts failed | handle="${handle}" | error=${err.message}`);
    throw err;
  }

  if (!Array.isArray(postsData)) {
    console.log(`${LOG_PREFIX} postsData not array | type=${typeof postsData} | keys=${postsData ? Object.keys(postsData).join(',') : 'n/a'}`);
    if (postsData?.posts) postsData = postsData.posts;
    else if (postsData?.data) postsData = postsData.data;
    else postsData = [];
  }

  console.log(`${LOG_PREFIX} fetchFacebookFeed after getPosts | postsCount=${postsData.length}`);

  if (postsData.length === 0) {
    throw new Error(`No posts found. Please verify the Facebook URL or page ID "${handle}".`);
  }

  let profileInfo = null;
  const first = postsData[0];
  if (first?.from) {
    profileInfo = { id: first.from.id, name: first.from.name, picture: first.from.picture };
    console.log(`${LOG_PREFIX} profileInfo from first post | id=${profileInfo.id} | name=${profileInfo.name}`);
  } else {
    console.log(`${LOG_PREFIX} no from on first post | firstPostKeys=${first ? Object.keys(first).join(',') : 'n/a'}`);
  }

  const posts = postsData.map((post) => normalizePost(post, handle, profileInfo));
  console.log(`${LOG_PREFIX} fetchFacebookFeed done | handle="${handle}" | normalizedPosts=${posts.length}`);

  return {
    handle,
    displayName: profileInfo?.name || handle,
    avatarUrl: profileInfo?.picture?.data?.url,
    posts
  };
}

module.exports = {
  fetchFacebookFeed,
  getPosts,
  normalizePost
};
