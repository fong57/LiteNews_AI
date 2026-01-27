// services/socialFeedFetcher/instagram.js
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
 * Fetch posts from Instagram
 */
async function getPosts(handle, limit = 20) {
  try {
    const apiKey = getApiKey();
    const cleanHandle = handle.replace('@', '').trim();
    
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
    
    const posts = [];
    let nextMaxId = null;
    const maxResults = Math.min(limit, 50); // Instagram API typically returns up to 50 per request
    
    do {
      const params = {
        handle: cleanHandle
      };
      
      if (nextMaxId) {
        params.next_max_id = nextMaxId;
      }
      
      const response = await axios.get(`${SOCIAVAULT_API_BASE}/instagram/posts`, {
        params: params,
        headers: {
          'X-API-Key': apiKey,
          'User-Agent': 'LiteNews_AI/1.0'
        },
        timeout: 15000
      });
      
      // Check different possible response structures
      let items = [];
      
      if (response.data) {
        const data = response.data.data || response.data;
        
        if (data?.items) {
          // Handle items as object with numeric keys or array
          console.log('Found items in data.items');
          items = objectToArray(data.items);
        } else if (Array.isArray(data)) {
          // Data is directly an array
          console.log('Data is directly an array');
          items = data;
        } else if (Array.isArray(response.data)) {
          // Response.data is directly an array
          console.log('Response.data is directly an array');
          items = response.data;
        } else {
          // Log the response structure for debugging
          const responsePreview = JSON.stringify(response.data).substring(0, 500);
          console.warn('Unexpected Instagram API response structure for handle:', cleanHandle);
          console.warn('Response keys:', response.data ? Object.keys(response.data) : 'no data');
          console.warn('Response preview:', responsePreview);
          
          // Check if it's an error response
          if (response.data.error || response.data.message) {
            throw new Error(response.data.message || response.data.error || 'API returned an error');
          }
        }
      }
      
      // Ensure items is always an array
      if (!Array.isArray(items)) {
        console.error(`Items is not an array for handle: ${cleanHandle}`, {
          type: typeof items,
          isArray: Array.isArray(items),
          value: items ? JSON.stringify(items).substring(0, 300) : 'null/undefined'
        });
        items = [];
      }
      
      if (items.length > 0) {
        posts.push(...items);
      }
      
      const data = response.data?.data || response.data;
      nextMaxId = data?.next_max_id;
      
      // Break if we have enough posts or no more pages
      if (posts.length >= limit || !nextMaxId || !data?.more_available) {
        break;
      }
    } while (posts.length < limit);
    
    // Ensure posts is always an array
    if (!Array.isArray(posts)) {
      console.error(`Posts is not an array for handle: ${cleanHandle}`, {
        type: typeof posts,
        isArray: Array.isArray(posts),
        value: posts ? JSON.stringify(posts).substring(0, 300) : 'null/undefined'
      });
      posts = [];
    }
    
    // Log if we got posts
    if (posts.length === 0) {
      console.warn(`No posts found in API response for handle: ${cleanHandle}`);
    } else {
      console.log(`Successfully fetched ${posts.length} posts for handle: ${cleanHandle}`);
    }
    
    // Limit results and ensure it's still an array
    const result = Array.isArray(posts) ? posts.slice(0, limit) : [];
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
        throw new Error(`Instagram handle not found: ${handle}. Please verify the handle is correct.`);
      } else if (status === 401 || status === 403) {
        throw new Error(`SociaVault API authentication failed. Please check your SOCIAVAULT_API_KEY.`);
      } else if (status === 402) {
        throw new Error(`SociaVault API: Insufficient credits. Please check your account balance.`);
      } else {
        throw new Error(`SociaVault API error (${status}): ${errorMsg}`);
      }
    }
    throw new Error(`Failed to fetch Instagram posts: ${error.message}`);
  }
}

/**
 * Normalize Instagram post to common post format
 */
function normalizePost(post, handle, profileInfo) {
  // Extract caption - ensure edges is an array
  const captionEdges = Array.isArray(post.caption?.edges) 
    ? post.caption.edges 
    : (post.caption?.edges ? [post.caption.edges] : []);
  
  // Extract caption text and ensure it's always a string
  let caption = '';
  if (captionEdges.length > 0) {
    caption = captionEdges[0]?.node?.text || captionEdges[0]?.text || '';
  } else {
    caption = post.caption || post.text || '';
  }
  
  // Ensure caption is a string (convert if needed)
  if (typeof caption !== 'string') {
    if (caption && typeof caption === 'object') {
      // If it's an object, try to extract text from it
      caption = caption.text || caption.node?.text || JSON.stringify(caption).substring(0, 500);
    } else {
      caption = String(caption || '');
    }
  }
  
  // Extract timestamp
  const timestamp = post.taken_at_timestamp || post.created_time;
  const publishedAt = timestamp ? new Date(timestamp * 1000) : new Date();
  
  // Extract engagement metrics
  const likeCount = post.edge_media_preview_like?.count || 
                    post.like_count || 
                    post.edge_liked_by?.count || 0;
  const commentCount = post.edge_media_to_comment?.count || 
                       post.comment_count || 0;
  
  // Calculate popularity score: likes*2 + comments*0.5
  const popularityScore = (likeCount * 2) + (commentCount * 0.5);
  
  // Extract media URLs
  const mediaUrls = [];
  if (post.display_url) {
    mediaUrls.push(post.display_url);
  }
  if (post.thumbnail_src) {
    mediaUrls.push(post.thumbnail_src);
  }
  if (post.video_url) {
    mediaUrls.push(post.video_url);
  }
  if (post.carousel_media) {
    // Ensure carousel_media is an array
    const carouselItems = Array.isArray(post.carousel_media) 
      ? post.carousel_media 
      : [post.carousel_media];
    
    carouselItems.forEach(item => {
      if (item?.image_versions2?.candidates) {
        const candidates = Array.isArray(item.image_versions2.candidates)
          ? item.image_versions2.candidates
          : [item.image_versions2.candidates];
        if (candidates[0]?.url) {
          mediaUrls.push(candidates[0].url);
        }
      }
      if (item?.video_versions) {
        const videoVersions = Array.isArray(item.video_versions)
          ? item.video_versions
          : [item.video_versions];
        if (videoVersions[0]?.url) {
          mediaUrls.push(videoVersions[0].url);
        }
      }
    });
  }
  
  // Extract hashtags from caption - ensure it's an array
  const hashtags = [];
  if (caption && typeof caption === 'string') {
    const hashtagMatches = caption.match(/#[\w]+/g);
    if (hashtagMatches && Array.isArray(hashtagMatches)) {
      hashtags.push(...hashtagMatches.map(tag => tag.replace('#', '')).filter(Boolean));
    }
  }
  
  // Construct post URL - try multiple ways to get shortcode
  // Instagram shortcode can be in different fields depending on API version
  const shortcode = post.shortcode || 
                    post.code || 
                    post.short_code ||
                    (post.permalink ? post.permalink.match(/\/p\/([^\/]+)/)?.[1] : null);
  
  // Construct Instagram post URL
  let postUrl = '';
  if (shortcode && typeof shortcode === 'string' && shortcode.length > 0) {
    // Clean shortcode (remove any slashes or special chars)
    const cleanShortcode = shortcode.replace(/[^A-Za-z0-9_-]/g, '');
    if (cleanShortcode.length > 0) {
      postUrl = `https://www.instagram.com/p/${cleanShortcode}/`;
    }
  }
  
  // If we still don't have a URL, try other methods
  if (!postUrl || postUrl.length === 0) {
    if (post.permalink && typeof post.permalink === 'string' && post.permalink.startsWith('http')) {
      // Use provided permalink if it's a full URL
      postUrl = post.permalink;
    } else if (post.permalink && typeof post.permalink === 'string') {
      // If permalink is relative, make it absolute
      postUrl = `https://www.instagram.com${post.permalink.startsWith('/') ? '' : '/'}${post.permalink}`;
    } else if (post.url && typeof post.url === 'string' && post.url.startsWith('http')) {
      // Use provided URL if available
      postUrl = post.url;
    } else if (post.id) {
      // Last resort: try to extract shortcode from ID (Instagram IDs can sometimes be converted)
      // Note: This may not always work, but it's better than an empty URL
      console.warn(`Instagram post missing shortcode for post ID: ${post.id}, handle: ${handle}`);
      const handleStr = handle.replace('@', '');
      postUrl = `https://www.instagram.com/${handleStr}/`;
    } else {
      // Absolute last resort: link to user profile
      console.warn(`Instagram post missing all URL identifiers for handle: ${handle}`);
      const handleStr = handle.replace('@', '');
      postUrl = `https://www.instagram.com/${handleStr}/`;
    }
  }
  
  // Ensure we always have a valid URL (never empty string)
  if (!postUrl || postUrl.length === 0) {
    const handleStr = handle.replace('@', '');
    postUrl = `https://www.instagram.com/${handleStr}/`;
    console.error(`Failed to construct Instagram post URL for handle: ${handle}, post:`, post.id || post.shortcode);
  }
  
  // Extract title (if available, otherwise use first part of caption)
  // Ensure caption is a string before calling substring
  const captionStr = typeof caption === 'string' ? caption : String(caption || '');
  const title = post.title || (captionStr.length > 0 ? captionStr.substring(0, 100) : null);
  
  return {
    platform: 'instagram',
    externalId: post.id || post.shortcode || post.code || post.pk || '',
    content: captionStr,
    title: title,
    description: captionStr.substring(0, 500), // Truncate long captions
    url: postUrl,
    publishedAt: publishedAt,
    author: {
      handle: handle,
      displayName: profileInfo?.full_name || profileInfo?.username || handle,
      avatarUrl: profileInfo?.profile_pic_url || profileInfo?.profile_pic_url_hd
    },
    engagement: {
      likes: likeCount,
      comments: commentCount,
      score: popularityScore
    },
    metadata: {
      mediaUrls: mediaUrls.filter(Boolean),
      tags: hashtags,
      shortcode: shortcode,
      isVideo: post.is_video || false
    }
  };
}

/**
 * Fetch posts for an Instagram handle
 */
async function fetchInstagramFeed(handle, limit = 20) {
  try {
    // Fetch posts only (no profile fetch)
    let postsData = await getPosts(handle, limit);
    
    // Ensure postsData is an array - add detailed logging
    if (!Array.isArray(postsData)) {
      console.error(`getPosts returned non-array for ${handle}:`, {
        type: typeof postsData,
        isArray: Array.isArray(postsData),
        value: postsData ? JSON.stringify(postsData).substring(0, 200) : 'null/undefined'
      });
      
      // Try to convert to array
      if (postsData && typeof postsData === 'object') {
        // If it's an object, try to extract array from it
        if (postsData.posts && Array.isArray(postsData.posts)) {
          postsData = postsData.posts;
        } else if (postsData.data && Array.isArray(postsData.data)) {
          postsData = postsData.data;
        } else if (postsData.items && Array.isArray(postsData.items)) {
          postsData = postsData.items;
        } else {
          // Last resort: wrap in array if it's a single object
          postsData = [postsData];
        }
      } else {
        postsData = [];
      }
    }
    
    // Final check
    if (!Array.isArray(postsData)) {
      throw new Error(`Failed to convert postsData to array. Type: ${typeof postsData}`);
    }
    
    if (postsData.length === 0) {
      throw new Error(`No posts found. Please verify the handle "${handle}" is correct.`);
    }
    
    // Extract profile info from posts if available (some APIs include user info in posts)
    let profileInfo = null;
    const firstPost = postsData[0];
    if (firstPost && firstPost.owner) {
      profileInfo = {
        username: firstPost.owner.username,
        full_name: firstPost.owner.full_name,
        profile_pic_url: firstPost.owner.profile_pic_url
      };
    }
    
    // Normalize posts - ensure we're mapping over an array
    const posts = Array.isArray(postsData) 
      ? postsData.map(post => normalizePost(post, handle, profileInfo))
      : [];
    
    return {
      handle: handle,
      displayName: profileInfo?.full_name || profileInfo?.username || handle,
      avatarUrl: profileInfo?.profile_pic_url,
      posts: posts
    };
  } catch (error) {
    console.error(`Error fetching Instagram feed for ${handle}:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchInstagramFeed,
  getPosts,
  normalizePost
};
