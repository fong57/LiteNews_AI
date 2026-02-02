// services/socialFeedFetcher/youtube.js
const axios = require('axios');

const SOCIAVAULT_API_BASE = 'https://api.sociavault.com/v1/scrape';

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
 * Resolve a YouTube handle/ID to channel ID
 * Supports:
 * - Channel ID (UC...)
 * - Username (@username)
 * - Custom URL (@customname)
 * - Full URL (https://youtube.com/@username)
 */
async function resolveChannel(handle) {
  try {
    console.log(`[YouTube] Resolving channel for handle: ${handle}`);
    const apiKey = getApiKey();
    const cleanHandle = handle.replace('@', '').trim();
    console.log(`[YouTube] Clean handle: ${cleanHandle}`);
    
    // If it looks like a channel ID (starts with UC), use it directly
    if (cleanHandle.startsWith('UC') && cleanHandle.length === 24) {
      console.log(`[YouTube] Using channel ID directly: ${cleanHandle}`);
      return {
        channelId: cleanHandle,
        handle: handle
      };
    }
    
    // Use SociaVault channel endpoint to resolve handle
    const apiUrl = `${SOCIAVAULT_API_BASE}/youtube/channel`;
    console.log(`[YouTube] Calling SociaVault API: ${apiUrl} with handle: ${cleanHandle}`);
    
    // Retry logic for timeout errors
    let lastError;
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[YouTube] Attempt ${attempt}/${maxRetries} to resolve channel`);
        const response = await axios.get(apiUrl, {
          params: {
            handle: cleanHandle
          },
          headers: {
            'X-API-Key': apiKey,
            'User-Agent': 'LiteNews_AI/1.0'
          },
          timeout: 60000 // Increased to 60 seconds
        });
        
        // If we get here, the request succeeded
        lastError = null;
        
        console.log(`[YouTube] API response status: ${response.status}`);
        console.log(`[YouTube] API response data keys:`, response.data ? Object.keys(response.data) : 'no data');
        console.log(`[YouTube] API response preview:`, JSON.stringify(response.data).substring(0, 500));
        
        // SociaVault API wraps the actual data in response.data.data
        const channelData = response.data?.data || response.data;
        
        if (channelData && channelData.channelId) {
          console.log(`[YouTube] Successfully resolved channel: ${channelData.channelId} (${channelData.name})`);
          
          // Extract avatar URL from nested structure
          let avatarUrl = null;
          if (channelData.avatar) {
            if (typeof channelData.avatar === 'string') {
              avatarUrl = channelData.avatar;
            } else if (channelData.avatar.url) {
              avatarUrl = channelData.avatar.url;
            } else if (channelData.avatar.image?.sources) {
              // Try to get the highest quality avatar
              // Sources are numbered keys like '0', '1', etc.
              const sources = channelData.avatar.image.sources;
              const sourceKeys = Object.keys(sources)
                .filter(key => !isNaN(parseInt(key)))
                .sort((a, b) => parseInt(b) - parseInt(a));
              if (sourceKeys.length > 0) {
                const bestSource = sources[sourceKeys[0]];
                avatarUrl = bestSource?.url || bestSource;
              }
            }
          }
          
          return {
            channelId: channelData.channelId,
            handle: handle,
            displayName: channelData.name,
            avatarUrl: avatarUrl
          };
        }
        
        console.error(`[YouTube] Channel not found in response data:`, response.data);
        throw new Error('Channel not found');
      } catch (error) {
        lastError = error;
        const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
        
        if (isTimeout && attempt < maxRetries) {
          console.warn(`[YouTube] Timeout on attempt ${attempt}, retrying...`);
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // If not a timeout or last attempt, break and handle error below
        if (!isTimeout || attempt === maxRetries) {
          break;
        }
      }
    }
    
    // If we get here, all retries failed or it's a non-timeout error
    // Throw the last error to be caught by outer catch block
    throw lastError || new Error('Failed to resolve channel after retries');
  } catch (error) {
    const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
    console.error(`[YouTube] Error resolving channel for ${handle}:`, error.message);
    if (isTimeout) {
      console.error(`[YouTube] Request timed out after multiple retries. The API may be slow or the handle may be invalid.`);
    }
    
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      console.error(`[YouTube] API error response - Status: ${status}`);
      console.error(`[YouTube] API error response data:`, errorData);
      
      let errorMsg = 'Unknown error';
      if (errorData) {
        if (typeof errorData === 'string') {
          errorMsg = errorData;
        } else if (errorData.message) {
          errorMsg = errorData.message;
        } else if (errorData.error) {
          errorMsg = errorData.error;
        } else {
          errorMsg = JSON.stringify(errorData).substring(0, 200);
        }
      } else {
        errorMsg = error.response.statusText;
      }
      
      if (status === 404) {
        throw new Error(`YouTube channel not found: ${handle}. Please verify the handle is correct.`);
      } else if (status === 401 || status === 403) {
        throw new Error(`SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.`);
      } else if (status === 402) {
        throw new Error(`SociaVault API: Insufficient credits. Please check your account balance.`);
      } else {
        throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
      }
    }
    
    console.error(`[YouTube] Non-API error details:`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    
    // Provide more helpful error message for timeouts
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error(`Failed to resolve YouTube channel: Request timed out. The handle "${handle}" may be invalid or the API is slow. Please verify the handle is correct.`);
    }
    
    throw new Error(`Failed to resolve YouTube channel: ${error.message}`);
  }
}

/**
 * Get channel information
 */
async function getChannelInfo(channelId) {
  try {
    const apiKey = getApiKey();
    const response = await axios.get(`${SOCIAVAULT_API_BASE}/youtube/channel`, {
      params: {
        channelId: channelId
      },
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'LiteNews_AI/1.0'
      },
      timeout: 60000 // Increased to 60 seconds
    });
    
    // SociaVault API wraps the actual data in response.data.data
    const channelData = response.data?.data || response.data;
    
    if (channelData && channelData.channelId) {
      return channelData;
    }
    
    throw new Error('Channel not found');
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      let errorMsg = 'Unknown error';
      if (errorData) {
        if (typeof errorData === 'string') {
          errorMsg = errorData;
        } else if (errorData.message) {
          errorMsg = errorData.message;
        } else if (errorData.error) {
          errorMsg = errorData.error;
        } else {
          errorMsg = JSON.stringify(errorData).substring(0, 200);
        }
      } else {
        errorMsg = error.response.statusText;
      }
      
      if (status === 404) {
        throw new Error(`YouTube channel not found: ${channelId}`);
      } else if (status === 401 || status === 403) {
        throw new Error(`SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.`);
      } else if (status === 402) {
        throw new Error(`SociaVault API: Insufficient credits. Please check your account balance.`);
      } else {
        throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
      }
    }
    throw new Error(`Failed to fetch channel info: ${error.message}`);
  }
}

/** Delay helper for retries */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch videos from a channel using SociaVault API
 * Retries on 502/503 (transient upstream errors).
 */
async function fetchChannelVideos(channelId, limit = 20) {
  const apiKey = getApiKey();
  const maxRetries = 3;
  const retryDelayMs = 2000;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[YouTube] Fetching channel videos for channelId: ${channelId}, limit: ${limit} (attempt ${attempt}/${maxRetries})`);
      const videos = [];
      let continuationToken = null;
      let pageCount = 0;

      do {
        pageCount++;
        console.log(`[YouTube] Fetching page ${pageCount} for channelId: ${channelId}`);

        const response = await axios.get(`${SOCIAVAULT_API_BASE}/youtube/channel-videos`, {
          params: {
            channelId: channelId,
            sort: 'latest',
            includeExtras: true, // Get like + comment count and description
            ...(continuationToken && { continuationToken: continuationToken })
          },
          headers: {
            'X-API-Key': apiKey,
            'User-Agent': 'LiteNews_AI/1.0'
          },
          timeout: 60000 // 60 seconds
        });
      
        console.log(`[YouTube] API response status: ${response.status}`);
        console.log(`[YouTube] Response data keys:`, response.data ? Object.keys(response.data) : 'no data');

        // SociaVault API wraps the actual data in response.data.data
        const videoData = response.data?.data || response.data;
        console.log(`[YouTube] Video data keys:`, videoData ? Object.keys(videoData) : 'no videoData');
        console.log(`[YouTube] Video data preview:`, JSON.stringify(videoData).substring(0, 500));

        if (videoData && videoData.videos) {
          const videoArray = Array.isArray(videoData.videos)
            ? videoData.videos
            : Object.values(videoData.videos);

          console.log(`[YouTube] Found ${videoArray.length} videos in this page`);
          videos.push(...videoArray);
        } else {
          console.warn(`[YouTube] No videos found in response data`);
          console.warn(`[YouTube] Full response data structure:`, JSON.stringify(response.data).substring(0, 2000));
        }

        // Get continuation token from nested structure
        continuationToken = videoData?.continuationToken || response.data?.continuationToken;

        console.log(`[YouTube] Has continuation token: ${!!continuationToken}, Total videos so far: ${videos.length}`);

        // Break if we have enough videos or no more pages
        if (videos.length >= limit || !continuationToken) {
          break;
        }
      } while (continuationToken && videos.length < limit);

      // Limit to requested number
      const result = videos.slice(0, limit);
      console.log(`[YouTube] Returning ${result.length} videos (requested ${limit})`);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[YouTube] Error fetching channel videos for ${channelId} (attempt ${attempt}/${maxRetries}):`, error.message);

      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        console.error(`[YouTube] API error response - Status: ${status}`);
        if (errorData) console.error(`[YouTube] API error response data:`, errorData);

        // Don't retry on client/auth/credits errors
        if (status === 404) {
          throw new Error(`YouTube channel videos not found: ${channelId}`);
        }
        if (status === 401 || status === 403) {
          throw new Error(`SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.`);
        }
        if (status === 402) {
          throw new Error(`SociaVault API: Insufficient credits. Please check your account balance.`);
        }

        // Retry on 502 Bad Gateway / 503 Service Unavailable (upstream temporary errors)
        if ((status === 502 || status === 503) && attempt < maxRetries) {
          console.warn(`[YouTube] SociaVault API returned ${status}. Retrying in ${retryDelayMs}ms...`);
          await delay(retryDelayMs);
          continue;
        }

        if (status === 502) {
          throw new Error('SociaVault API is temporarily unavailable (502 Bad Gateway). Please try again in a few minutes.');
        }
        if (status === 503) {
          throw new Error('SociaVault API is temporarily overloaded (503). Please try again in a few minutes.');
        }

        let errorMsg = 'Unknown error';
        if (errorData) {
          if (typeof errorData === 'string') errorMsg = errorData;
          else if (errorData.message) errorMsg = errorData.message;
          else if (errorData.error) errorMsg = errorData.error;
          else errorMsg = JSON.stringify(errorData).substring(0, 200);
        } else {
          errorMsg = error.response.statusText;
        }
        throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
      }

      // Network/timeout or other non-API error: retry if attempts left
      if (attempt < maxRetries) {
        console.warn(`[YouTube] Request failed (${error.message}). Retrying in ${retryDelayMs}ms...`);
        await delay(retryDelayMs);
        continue;
      }

      console.error(`[YouTube] Non-API error details:`, {
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
      throw new Error(`Failed to fetch channel videos: ${error.message}`);
    }
  }

  // Should not reach here; lastError is set before continue/throw
  throw lastError || new Error(`Failed to fetch channel videos for ${channelId}`);
}

/**
 * Normalize YouTube video to common post format
 * Maps SociaVault API response to our standard format
 */
function normalizePost(video, handle, channelInfo) {
  // SociaVault API response structure
  const videoId = video.id || video.videoId;
  const title = video.title || '';
  const description = video.description || '';
  // Determine publishedAt robustly from multiple possible fields returned by SociaVault
  let publishedAt = null;
  const tryParseDate = (val) => {
    if (!val && val !== 0) return null;
    // Numbers may be seconds or milliseconds
    if (typeof val === 'number') {
      // If it's in seconds (reasonable range), convert to ms
      if (val < 1e12) return new Date(val * 1000);
      return new Date(val);
    }
    // Strings: try ISO parse
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return new Date(parsed);
      // Try extracting unix timestamp within the string
      const m = val.match(/(\d{10,13})/);
      if (m) {
        const n = Number(m[1]);
        if (n < 1e12) return new Date(n * 1000);
        return new Date(n);
      }
    }
    return null;
  };

  const dateCandidates = [
    video.publishDate,
    video.publish_date,
    video.publishTime,
    video.publish_time,
    video.publishTimestamp,
    video.publish_timestamp,
    video.publishedAt,
    video.published_at,
    video.published,
    video.uploadDate,
    video.upload_date,
    video.datePublished,
    video.publishedDate,
    video.publishDateText,
    video.publishDateText,
    video.publishDateText || video.publishDateText,
    video.publishedText,
    video.publishDateText
  ];

  for (const cand of dateCandidates) {
    const d = tryParseDate(cand);
    if (d) {
      publishedAt = d;
      break;
    }
  }

  // As a last resort, try known nested locations (some SociaVault shapes)
  if (!publishedAt) {
    if (video.snippet && video.snippet.publishedAt) {
      publishedAt = tryParseDate(video.snippet.publishedAt);
    } else if (video.published && video.published.time) {
      publishedAt = tryParseDate(video.published.time);
    }
  }

  // If still not found, try to infer publishedAt from SociaVault's publishedTime + publishedTimeText
  // (publishedTime is when the API returned data; publishedTimeText is human relative like "7 minutes ago").
  const parseRelativeTextToMs = (text) => {
    if (!text || typeof text !== 'string') return null;
    const t = text.trim().toLowerCase();
    if (t === 'just now' || t === 'just' || t === 'now') return 0;
    if (t === 'yesterday') return 24 * 60 * 60 * 1000;

    // Match patterns like "7 minutes ago", "an hour ago", "2 days ago", "3 hrs ago"
    const m = t.match(/^(?:about\s+)?(?:(an|a)|(\d+))\s*(second|sec|s|minute|min|m|hour|hr|h|day|d|week|w|month|mo|year|y)s?\b/);
    if (m) {
      const qty = m[2] ? parseInt(m[2], 10) : 1;
      const unit = m[3];
      const multipliers = {
        second: 1000,
        sec: 1000,
        s: 1000,
        minute: 60 * 1000,
        min: 60 * 1000,
        m: 60 * 1000,
        hour: 60 * 60 * 1000,
        hr: 60 * 60 * 1000,
        h: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        mo: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000
      };
      const key = Object.keys(multipliers).find(k => unit.startsWith(k));
      if (key) return qty * multipliers[key];
    }

    // Try compact forms like "7m", "2h", "3d"
    const m2 = t.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/);
    if (m2) {
      const qty = parseInt(m2[1], 10);
      const unit = m2[2];
      const map2 = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        mo: 30 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000
      };
      if (map2[unit]) return qty * map2[unit];
    }

    return null;
  };

  if (!publishedAt && video.publishedTime && video.publishedTimeText) {
    const base = tryParseDate(video.publishedTime);
    const relMs = parseRelativeTextToMs(video.publishedTimeText);
    if (base && relMs !== null) {
      publishedAt = new Date(base.getTime() - relMs);
      console.log('[YouTube] normalizePost: estimated publishedAt from publishedTimeText for videoId=', videoId, {
        publishedTime: base.toISOString(),
        publishedTimeText: video.publishedTimeText,
        estimated: publishedAt.toISOString()
      });
    }
  }

  // If still not found, try common "createdAt" like fields from SociaVault as a fallback,
  // otherwise leave as null to avoid using DB insertion time.
  if (!publishedAt) {
    const createdCandidates = [
      video.createdAt,
      video.created_at,
      video.created,
      video.addedAt,
      video.added_at,
      video.indexedAt,
      video.indexed_at,
      video.firstSeen,
      video.first_seen,
      video.scrapedAt,
      video.scraped_at,
      video.uploadedAt,
      video.uploaded_at,
      video.dateAdded,
      video.date_added
    ];

    for (const cand of createdCandidates) {
      const d = tryParseDate(cand);
      if (d) {
        publishedAt = d;
        console.warn('[YouTube] normalizePost: Using fallback createdAt-like field for publishedAt for videoId=', videoId);
        break;
      }
    }
  }

  if (!publishedAt) {
    // Log available keys to help identify which SociaVault field contains publish time
    try {
      const keys = Object.keys(video).slice(0, 50);
      console.warn('[YouTube] normalizePost: Unable to determine publishedAt. Video keys:', keys, 'videoId=', videoId);
    } catch (e) {
      console.warn('[YouTube] normalizePost: Unable to determine publishedAt and failed to list keys for videoId=', videoId);
    }
  }
  
  // Extract engagement metrics from SociaVault response
  const viewCount = video.viewCountInt || parseInt(video.viewCount || 0, 10);
  const likeCount = video.likeCountInt || parseInt(video.likeCount || 0, 10);
  const commentCount = video.commentCountInt || parseInt(video.commentCount || 0, 10);
  
  // Calculate popularity score: views/1000 + likes*2 + comments*0.5
  // This gives weight to engagement while considering view count
  const popularityScore = (viewCount / 1000) + (likeCount * 2) + (commentCount * 0.5);
  
  // Extract thumbnail
  const thumbnailUrl = video.thumbnail || video.thumbnails?.high?.url || 
                       video.thumbnails?.medium?.url || 
                       video.thumbnails?.default?.url;
  
  // Construct video URL
  const videoUrl = video.url || `https://www.youtube.com/watch?v=${videoId}`;
  
  // Extract tags/keywords
  const tags = video.keywords || video.tags || [];
  
  // Extract duration if available
  const duration = video.durationFormatted || video.durationMs;
  
  return {
    platform: 'youtube',
    externalId: videoId,
    content: description,
    title: title,
    description: description.substring(0, 500), // Truncate long descriptions
    url: videoUrl,
    publishedAt: publishedAt,
    author: {
      handle: handle,
      displayName: channelInfo?.displayName || channelInfo?.name || video.channel?.name || handle,
      avatarUrl: channelInfo?.avatarUrl || channelInfo?.avatar?.url || video.channel?.avatar?.url
    },
    engagement: {
      likes: likeCount,
      views: viewCount,
      comments: commentCount,
      score: popularityScore
    },
    metadata: {
      mediaUrls: thumbnailUrl ? [thumbnailUrl] : [],
      tags: Array.isArray(tags) ? tags : [],
      duration: duration,
      videoId: videoId
    }
  };
}

/**
 * Fetch videos for a YouTube channel
 */
async function fetchYouTubeFeed(handle, limit = 20) {
  try {
    console.log(`[YouTube] Starting feed fetch for handle: ${handle}, limit: ${limit}`);
    
    // Resolve channel (this already gets basic channel info)
    const channelInfo = await resolveChannel(handle);
    console.log(`[YouTube] Channel resolved:`, {
      channelId: channelInfo.channelId,
      displayName: channelInfo.displayName,
      handle: channelInfo.handle
    });
    
    // Fetch videos from channel
    console.log(`[YouTube] Fetching videos for channelId: ${channelInfo.channelId}`);
    const videos = await fetchChannelVideos(channelInfo.channelId, limit);
    console.log(`[YouTube] Fetched ${videos.length} videos`);
    
    if (videos.length === 0) {
      throw new Error(`No videos found for channel: ${handle}`);
    }
    
    // Extract channel info from first video if available (fallback)
    const firstVideo = videos[0];
    const channelName = channelInfo.displayName || firstVideo?.channel?.name || handle;
    const channelAvatar = channelInfo.avatarUrl || firstVideo?.channel?.avatar?.url || firstVideo?.channel?.avatar;
    
    console.log(`[YouTube] Using channel info:`, {
      name: channelName,
      hasAvatar: !!channelAvatar
    });
    
    // Normalize posts
    const posts = videos.map(video => normalizePost(video, handle, {
      displayName: channelName,
      avatarUrl: channelAvatar,
      name: channelName
    }));
    
    console.log(`[YouTube] Successfully fetched feed for ${handle}: ${posts.length} posts`);
    
    return {
      handle: handle,
      displayName: channelName,
      avatarUrl: channelAvatar,
      posts: posts
    };
  } catch (error) {
    console.error(`[YouTube] Error fetching YouTube feed for ${handle}:`, error.message);
    console.error(`[YouTube] Error stack:`, error.stack?.substring(0, 500));
    throw error;
  }
}

// Legacy function names for backward compatibility
async function fetchPlaylistVideos(channelId, limit = 20) {
  // This function is kept for backward compatibility but now uses channel videos
  return fetchChannelVideos(channelId, limit);
}

module.exports = {
  fetchYouTubeFeed,
  resolveChannel,
  getChannelInfo,
  fetchChannelVideos,
  fetchPlaylistVideos, // Legacy alias
  normalizePost
};
