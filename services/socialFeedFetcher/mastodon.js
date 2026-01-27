// services/socialFeedFetcher/mastodon.js
const axios = require('axios');

/**
 * Resolve a Mastodon handle (user@instance.social) to account ID
 */
async function resolveAccount(handle, instanceBaseUrl) {
  try {
    // Extract username and instance from handle
    const [username, instance] = handle.split('@');
    
    // Use provided instanceBaseUrl or construct from handle
    const baseUrl = instanceBaseUrl || `https://${instance}`;
    
    // Mastodon API: GET /api/v1/accounts/lookup
    const lookupUrl = `${baseUrl}/api/v1/accounts/lookup`;
    const response = await axios.get(lookupUrl, {
      params: { acct: handle },
      timeout: 10000,
      headers: {
        'User-Agent': 'LiteNews_AI/1.0'
      }
    });
    
    if (response.data && response.data.id) {
      return {
        id: response.data.id,
        username: response.data.username,
        displayName: response.data.display_name || response.data.username,
        avatarUrl: response.data.avatar,
        url: response.data.url,
        instanceBaseUrl: baseUrl
      };
    }
    
    throw new Error('Account not found');
  } catch (error) {
    if (error.response) {
      throw new Error(`Mastodon API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`Failed to resolve Mastodon account: ${error.message}`);
  }
}

/**
 * Fetch statuses (posts) for a Mastodon account
 */
async function fetchStatuses(accountId, instanceBaseUrl, limit = 20) {
  try {
    const statusesUrl = `${instanceBaseUrl}/api/v1/accounts/${accountId}/statuses`;
    const response = await axios.get(statusesUrl, {
      params: {
        limit: Math.min(limit, 40), // Mastodon max is usually 40
        exclude_replies: false,
        exclude_reblogs: false
      },
      timeout: 15000,
      headers: {
        'User-Agent': 'LiteNews_AI/1.0'
      }
    });
    
    return response.data || [];
  } catch (error) {
    if (error.response) {
      throw new Error(`Mastodon API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`Failed to fetch Mastodon statuses: ${error.message}`);
  }
}

/**
 * Normalize Mastodon status to common post format
 */
function normalizePost(status, handle, accountInfo) {
  // Strip HTML tags from content for plain text
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  };
  
  const content = stripHtml(status.content);
  
  // Calculate popularity score: likes + 2*reposts + 0.5*replies
  const popularityScore = status.favourites_count + (2 * status.reblogs_count) + (0.5 * status.replies_count);
  
  return {
    platform: 'mastodon',
    externalId: status.id.toString(),
    content: content,
    url: status.url || status.uri,
    publishedAt: new Date(status.created_at),
    author: {
      handle: handle,
      displayName: accountInfo.displayName,
      avatarUrl: accountInfo.avatarUrl
    },
    engagement: {
      likes: status.favourites_count || 0,
      reposts: status.reblogs_count || 0,
      replies: status.replies_count || 0,
      score: popularityScore
    },
    metadata: {
      mediaUrls: (status.media_attachments || []).map(m => m.url || m.remote_url).filter(Boolean),
      tags: (status.tags || []).map(t => t.name)
    }
  };
}

/**
 * Fetch posts for a Mastodon handle
 */
async function fetchMastodonFeed(handle, instanceBaseUrl, limit = 20) {
  try {
    // Resolve account
    const accountInfo = await resolveAccount(handle, instanceBaseUrl);
    
    // Fetch statuses
    const statuses = await fetchStatuses(accountInfo.id, accountInfo.instanceBaseUrl, limit);
    
    // Normalize posts
    const posts = statuses.map(status => normalizePost(status, handle, accountInfo));
    
    return {
      handle: handle,
      displayName: accountInfo.displayName,
      avatarUrl: accountInfo.avatarUrl,
      posts: posts
    };
  } catch (error) {
    console.error(`Error fetching Mastodon feed for ${handle}:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchMastodonFeed,
  resolveAccount,
  fetchStatuses,
  normalizePost
};
