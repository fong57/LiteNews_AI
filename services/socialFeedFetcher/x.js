// services/socialFeedFetcher/x.js
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
 * Fetch user tweets from X/Twitter
 */
async function getUserTweets(handle, limit = 20) {
  try {
    const apiKey = getApiKey();
    const cleanHandle = handle.replace('@', '').trim();
    
    const response = await axios.get(`${SOCIAVAULT_API_BASE}/twitter/user-tweets`, {
      params: {
        handle: cleanHandle
      },
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'LiteNews_AI/1.0'
      },
      timeout: 15000
    });
    
    // Check different possible response structures
    let tweets = [];
    
    if (response.data) {
      // Helper function to convert object with numeric keys to array
      const objectToArray = (obj) => {
        if (!obj) {
          console.log('objectToArray: obj is null/undefined');
          return [];
        }
        if (Array.isArray(obj)) {
          console.log('objectToArray: obj is already an array, length:', obj.length);
          return obj;
        }
        if (typeof obj !== 'object') {
          console.log('objectToArray: obj is not an object, type:', typeof obj);
          return [];
        }
        // Convert object with numeric keys to array
        const keys = Object.keys(obj).filter(key => !isNaN(parseInt(key))).sort((a, b) => parseInt(a) - parseInt(b));
        console.log('objectToArray: converting object with keys:', keys.slice(0, 10));
        const result = keys.map(key => obj[key]).filter(item => item !== null && item !== undefined);
        console.log('objectToArray: result length:', result.length);
        return result;
      };
      
      // Try different possible response structures
      // Based on logs, the structure is: response.data.data.tweets (object with numeric keys)
      if (response.data.data?.tweets) {
        // Most common case: nested data structure with tweets object
        console.log('Found tweets in response.data.data.tweets');
        tweets = objectToArray(response.data.data.tweets);
      } else if (response.data.tweets) {
        // Direct tweets property
        console.log('Found tweets in response.data.tweets');
        tweets = objectToArray(response.data.tweets);
      } else if (Array.isArray(response.data)) {
        // Response is directly an array
        console.log('Response.data is directly an array');
        tweets = response.data;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        // Data property is an array
        console.log('Found array in response.data.data');
        tweets = response.data.data;
      } else {
        // Log the response structure for debugging
        const responsePreview = JSON.stringify(response.data).substring(0, 500);
        console.warn('Unexpected X API response structure for handle:', cleanHandle);
        console.warn('Response keys:', response.data ? Object.keys(response.data) : 'no data');
        console.warn('Response preview:', responsePreview);
        
        // Check if it's an error response
        if (response.data.error || response.data.message) {
          throw new Error(response.data.message || response.data.error || 'API returned an error');
        }
      }
    }
    
    // Ensure tweets is always an array
    if (!Array.isArray(tweets)) {
      console.error(`Tweets is not an array for handle: ${cleanHandle}`, {
        type: typeof tweets,
        isArray: Array.isArray(tweets),
        value: tweets ? JSON.stringify(tweets).substring(0, 300) : 'null/undefined',
        responseDataKeys: response.data ? Object.keys(response.data) : []
      });
      tweets = [];
    }
    
    // Log if we got tweets
    if (tweets.length === 0) {
      console.warn(`No tweets found in API response for handle: ${cleanHandle}`);
    } else {
      console.log(`Successfully fetched ${tweets.length} tweets for handle: ${cleanHandle}`);
    }
    
    // Limit results and ensure it's still an array
    const result = Array.isArray(tweets) ? tweets.slice(0, Math.min(limit, tweets.length)) : [];
    return result;
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
        throw new Error(`X handle not found: ${handle}. Please verify the handle is correct.`);
      } else if (status === 401 || status === 403) {
        throw new Error(`SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.`);
      } else if (status === 402) {
        throw new Error(`SociaVault API: Insufficient credits. Please check your account balance.`);
      } else {
        throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
      }
    }
    throw new Error(`Failed to fetch X tweets: ${error.message}`);
  }
}

/**
 * Normalize X/Twitter tweet to common post format
 */
function normalizePost(tweet, handle, profileInfo) {
  const legacy = tweet.legacy || {};
  const core = tweet.core?.user_results?.result || {};
  const userLegacy = core.legacy || profileInfo?.legacy || {};
  
  const fullText = legacy.full_text || '';
  const createdAt = legacy.created_at ? new Date(legacy.created_at) : new Date();
  
  // Extract engagement metrics
  const favoriteCount = legacy.favorite_count || 0;
  const retweetCount = legacy.retweet_count || 0;
  const replyCount = legacy.reply_count || 0;
  const quoteCount = legacy.quote_count || 0;
  const viewCount = parseInt(tweet.views?.count || 0, 10);
  
  // Calculate popularity score: views/1000 + likes*2 + retweets*2 + replies*0.5 + quotes
  const popularityScore = (viewCount / 1000) + (favoriteCount * 2) + (retweetCount * 2) + (replyCount * 0.5) + quoteCount;
  
  // Extract media URLs
  const mediaUrls = [];
  const extendedMedia = tweet.extended_entities?.media;
  const legacyMedia = legacy.entities?.media;
  
  if (extendedMedia) {
    const mediaArray = Array.isArray(extendedMedia) ? extendedMedia : [extendedMedia];
    mediaUrls.push(...mediaArray.map(m => m?.media_url_https || m?.url).filter(Boolean));
  } else if (legacyMedia) {
    const mediaArray = Array.isArray(legacyMedia) ? legacyMedia : [legacyMedia];
    mediaUrls.push(...mediaArray.map(m => m?.media_url_https || m?.url).filter(Boolean));
  }
  
  // Extract hashtags - ensure it's an array
  const hashtagsArray = legacy.entities?.hashtags;
  const hashtags = Array.isArray(hashtagsArray) 
    ? hashtagsArray.map(h => h?.text || h).filter(Boolean)
    : [];
  
  // Construct tweet URL
  const tweetId = tweet.rest_id || legacy.id_str;
  const screenName = userLegacy.screen_name || handle.replace('@', '');
  const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;
  
  return {
    platform: 'x',
    externalId: tweetId || legacy.id_str || '',
    content: fullText,
    title: null, // X tweets don't have titles
    description: fullText.substring(0, 500), // Truncate long tweets
    url: tweetUrl,
    publishedAt: createdAt,
    author: {
      handle: handle,
      displayName: userLegacy.name || screenName || handle,
      avatarUrl: userLegacy.profile_image_url_https
    },
    engagement: {
      likes: favoriteCount,
      reposts: retweetCount,
      replies: replyCount,
      views: viewCount,
      score: popularityScore
    },
    metadata: {
      mediaUrls: mediaUrls,
      tags: hashtags,
      tweetId: tweetId
    }
  };
}

/**
 * Fetch posts for an X/Twitter handle
 */
async function fetchXFeed(handle, limit = 20) {
  try {
    // Fetch tweets only (no profile fetch)
    let tweets = await getUserTweets(handle, limit);
    
    // Ensure tweets is an array - add detailed logging
    if (!Array.isArray(tweets)) {
      console.error(`getUserTweets returned non-array for ${handle}:`, {
        type: typeof tweets,
        isArray: Array.isArray(tweets),
        value: tweets ? JSON.stringify(tweets).substring(0, 200) : 'null/undefined'
      });
      
      // Try to convert to array
      if (tweets && typeof tweets === 'object') {
        // If it's an object, try to extract array from it
        if (tweets.tweets && Array.isArray(tweets.tweets)) {
          tweets = tweets.tweets;
        } else if (tweets.data && Array.isArray(tweets.data)) {
          tweets = tweets.data;
        } else {
          // Last resort: wrap in array if it's a single object
          tweets = [tweets];
        }
      } else {
        tweets = [];
      }
    }
    
    // Final check
    if (!Array.isArray(tweets)) {
      throw new Error(`Failed to convert tweets to array. Type: ${typeof tweets}`);
    }
    
    if (tweets.length === 0) {
      throw new Error(`No tweets found. Please verify the handle "${handle}" is correct.`);
    }
    
    // Extract profile info from first tweet
    let profileLegacy = {};
    const firstTweet = tweets[0];
    if (firstTweet) {
      const userResult = firstTweet.core?.user_results?.result;
      if (userResult && userResult.legacy) {
        profileLegacy = userResult.legacy;
      }
    }
    
    // Normalize posts (pass null for profileInfo since we're not fetching profile)
    const posts = Array.isArray(tweets) ? tweets.map(tweet => normalizePost(tweet, handle, null)) : [];
    
    return {
      handle: handle,
      displayName: profileLegacy.name || profileLegacy.screen_name || handle,
      avatarUrl: profileLegacy.profile_image_url_https,
      posts: posts
    };
  } catch (error) {
    console.error(`Error fetching X feed for ${handle}:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchXFeed,
  getUserTweets,
  normalizePost
};
