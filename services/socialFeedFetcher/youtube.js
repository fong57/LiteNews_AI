// services/socialFeedFetcher/youtube.js
const axios = require('axios');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Get YouTube API key from environment
 */
function getApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Resolve a YouTube handle/ID to channel ID
 * Supports:
 * - Channel ID (UC...)
 * - Username (@username)
 * - Custom URL (@customname)
 */
async function resolveChannel(handle) {
  try {
    const apiKey = getApiKey();
    const cleanHandle = handle.replace('@', '').trim();
    
    // If it looks like a channel ID (starts with UC), use it directly
    if (cleanHandle.startsWith('UC') && cleanHandle.length === 24) {
      return {
        channelId: cleanHandle,
        handle: handle
      };
    }
    
    // Try to resolve by username/custom URL
    // First, try channels.list with forUsername
    try {
      const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
        params: {
          part: 'id,snippet',
          forUsername: cleanHandle,
          key: apiKey
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'LiteNews_AI/1.0'
        }
      });
      
      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        return {
          channelId: channel.id,
          handle: handle,
          displayName: channel.snippet?.title,
          avatarUrl: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url
        };
      }
    } catch (usernameError) {
      // If forUsername fails, try searching for the channel
      console.log(`forUsername lookup failed, trying search for: ${cleanHandle}`);
    }
    
    // Try searching for the channel
    const searchResponse = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params: {
        part: 'snippet',
        q: cleanHandle,
        type: 'channel',
        maxResults: 1,
        key: apiKey
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'LiteNews_AI/1.0'
      }
    });
    
    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      const channel = searchResponse.data.items[0];
      return {
        channelId: channel.id.channelId,
        handle: handle,
        displayName: channel.snippet?.title,
        avatarUrl: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url
      };
    }
    
    throw new Error('Channel not found');
  } catch (error) {
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.status} - ${error.response.data?.error?.message || error.response.statusText}`);
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
    const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
      params: {
        part: 'id,snippet,contentDetails,statistics',
        id: channelId,
        key: apiKey
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'LiteNews_AI/1.0'
      }
    });
    
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0];
    }
    
    throw new Error('Channel not found');
  } catch (error) {
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.status} - ${error.response.data?.error?.message || error.response.statusText}`);
    }
    throw new Error(`Failed to fetch channel info: ${error.message}`);
  }
}

/**
 * Get uploads playlist ID from channel
 */
function getUploadsPlaylistId(channel) {
  return channel.contentDetails?.relatedPlaylists?.uploads;
}

/**
 * Fetch videos from a playlist
 */
async function fetchPlaylistVideos(playlistId, limit = 20) {
  try {
    const apiKey = getApiKey();
    const videos = [];
    let nextPageToken = null;
    const maxResults = Math.min(limit, 50); // YouTube API max is 50 per request
    
    do {
      const response = await axios.get(`${YOUTUBE_API_BASE}/playlistItems`, {
        params: {
          part: 'snippet,contentDetails',
          playlistId: playlistId,
          maxResults: maxResults,
          pageToken: nextPageToken,
          key: apiKey
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'LiteNews_AI/1.0'
        }
      });
      
      if (response.data.items) {
        videos.push(...response.data.items);
      }
      
      nextPageToken = response.data.nextPageToken;
      
      // Break if we have enough videos or no more pages
      if (videos.length >= limit || !nextPageToken) {
        break;
      }
    } while (nextPageToken && videos.length < limit);
    
    // Get detailed video statistics
    const videoIds = videos.slice(0, limit).map(v => v.contentDetails?.videoId).filter(Boolean);
    
    if (videoIds.length === 0) {
      return [];
    }
    
    // Fetch video statistics and details
    const videoDetailsResponse = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
      params: {
        part: 'id,snippet,statistics,contentDetails',
        id: videoIds.join(','),
        key: apiKey
      },
      timeout: 15000,
      headers: {
        'User-Agent': 'LiteNews_AI/1.0'
      }
    });
    
    return videoDetailsResponse.data.items || [];
  } catch (error) {
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.status} - ${error.response.data?.error?.message || error.response.statusText}`);
    }
    throw new Error(`Failed to fetch playlist videos: ${error.message}`);
  }
}

/**
 * Normalize YouTube video to common post format
 */
function normalizePost(video, handle, channelInfo) {
  const snippet = video.snippet || {};
  const statistics = video.statistics || {};
  
  const title = snippet.title || '';
  const description = snippet.description || '';
  const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : new Date();
  
  // Extract engagement metrics
  const viewCount = parseInt(statistics.viewCount || 0, 10);
  const likeCount = parseInt(statistics.likeCount || 0, 10);
  const commentCount = parseInt(statistics.commentCount || 0, 10);
  
  // Calculate popularity score: views/1000 + likes*2 + comments*0.5
  // This gives weight to engagement while considering view count
  const popularityScore = (viewCount / 1000) + (likeCount * 2) + (commentCount * 0.5);
  
  // Extract thumbnail
  const thumbnailUrl = snippet.thumbnails?.high?.url || 
                       snippet.thumbnails?.medium?.url || 
                       snippet.thumbnails?.default?.url;
  
  // Construct video URL
  const videoId = video.id;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Extract tags
  const tags = snippet.tags || [];
  
  // Extract duration if available
  const duration = video.contentDetails?.duration;
  
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
      displayName: channelInfo?.displayName || snippet.channelTitle || handle,
      avatarUrl: channelInfo?.avatarUrl || snippet.thumbnails?.default?.url
    },
    engagement: {
      likes: likeCount,
      views: viewCount,
      comments: commentCount,
      score: popularityScore
    },
    metadata: {
      mediaUrls: thumbnailUrl ? [thumbnailUrl] : [],
      tags: tags,
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
    // Resolve channel
    const channelInfo = await resolveChannel(handle);
    
    // Get full channel information
    const channel = await getChannelInfo(channelInfo.channelId);
    
    // Get uploads playlist ID
    const uploadsPlaylistId = getUploadsPlaylistId(channel);
    if (!uploadsPlaylistId) {
      throw new Error('Could not find uploads playlist for channel');
    }
    
    // Fetch videos from uploads playlist
    const videos = await fetchPlaylistVideos(uploadsPlaylistId, limit);
    
    // Normalize posts
    const posts = videos.map(video => normalizePost(video, handle, {
      displayName: channelInfo.displayName || channel.snippet?.title,
      avatarUrl: channelInfo.avatarUrl || channel.snippet?.thumbnails?.high?.url
    }));
    
    return {
      handle: handle,
      displayName: channelInfo.displayName || channel.snippet?.title || handle,
      avatarUrl: channelInfo.avatarUrl || channel.snippet?.thumbnails?.high?.url,
      posts: posts
    };
  } catch (error) {
    console.error(`Error fetching YouTube feed for ${handle}:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchYouTubeFeed,
  resolveChannel,
  getChannelInfo,
  fetchPlaylistVideos,
  normalizePost
};
