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

/**
 * Fetch videos from a channel using SociaVault API
 */
async function fetchChannelVideos(channelId, limit = 20) {
  try {
    console.log(`[YouTube] Fetching channel videos for channelId: ${channelId}, limit: ${limit}`);
    const apiKey = getApiKey();
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
        timeout: 60000 // Increased to 60 seconds
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
    console.error(`[YouTube] Error fetching channel videos for ${channelId}:`, error.message);
    
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
        throw new Error(`YouTube channel videos not found: ${channelId}`);
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
      stack: error.stack?.substring(0, 500)
    });
    throw new Error(`Failed to fetch channel videos: ${error.message}`);
  }
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
  const publishedAt = video.publishDate ? new Date(video.publishDate) : 
                     (video.publishDateText ? new Date(video.publishDateText) : new Date());
  
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
