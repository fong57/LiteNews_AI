// services/socialFeedFetcher/index.js
const SocialHandle = require('../../models/SocialHandle');
const SocialPost = require('../../models/SocialPost');
const { fetchYouTubeFeed } = require('./youtube');
const { fetchXFeed } = require('./x');
const { fetchInstagramFeed } = require('./instagram');

/**
 * Fetch feeds for all active social handles
 */
async function fetchFeedsForAllHandles() {
  const handles = await SocialHandle.find({ isActive: true });
  const results = {
    total: handles.length,
    success: 0,
    failed: 0,
    postsFetched: 0,
    errors: []
  };
  
  for (const handle of handles) {
    try {
      let feedData;
      
      if (handle.platform === 'youtube') {
        feedData = await fetchYouTubeFeed(handle.handle, 20);
      } else if (handle.platform === 'x') {
        feedData = await fetchXFeed(handle.handle, 20);
      } else if (handle.platform === 'instagram') {
        feedData = await fetchInstagramFeed(handle.handle, 20);
      } else {
        throw new Error(`Unsupported platform: ${handle.platform}`);
      }
      
      // Update handle metadata if available
      if (feedData.displayName && !handle.displayName) {
        handle.displayName = feedData.displayName;
      }
      if (feedData.avatarUrl && !handle.avatarUrl) {
        handle.avatarUrl = feedData.avatarUrl;
      }
      handle.lastFetchedAt = new Date();
      await handle.save();
      
      // Upsert posts (prevent duplicates by platform + externalId)
      let postsSaved = 0;
      for (const postData of feedData.posts) {
        try {
          await SocialPost.findOneAndUpdate(
            {
              platform: postData.platform,
              externalId: postData.externalId
            },
            {
              $set: {
                handleId: handle._id,
                handle: handle.handle,
                content: postData.content,
                title: postData.title,
                description: postData.description,
                url: postData.url,
                publishedAt: postData.publishedAt,
                author: postData.author,
                engagement: {
              likes: postData.engagement.likes || 0,
              reposts: postData.engagement.reposts || 0,
              replies: postData.engagement.replies || 0,
              views: postData.engagement.views || 0,
              comments: postData.engagement.comments || 0,
              score: postData.engagement.score || 0
            },
                metadata: postData.metadata
              }
            },
            {
              upsert: true,
              new: true
            }
          );
          postsSaved++;
        } catch (postError) {
          console.error(`Error saving post ${postData.externalId}:`, postError.message);
        }
      }
      
      results.success++;
      results.postsFetched += postsSaved;
    } catch (error) {
      results.failed++;
      results.errors.push({
        handle: handle.handle,
        platform: handle.platform,
        error: error.message
      });
      console.error(`Error fetching feed for ${handle.handle} (${handle.platform}):`, error.message);
    }
  }
  
  return results;
}

/**
 * Fetch feed for a specific handle
 */
async function fetchFeedForHandle(handleId) {
  const handle = await SocialHandle.findById(handleId);
  if (!handle) {
    throw new Error('Social handle not found');
  }
  
  if (!handle.isActive) {
    throw new Error('Social handle is not active');
  }
  
  let feedData;
  
  if (handle.platform === 'youtube') {
    feedData = await fetchYouTubeFeed(handle.handle, 20);
  } else if (handle.platform === 'x') {
    feedData = await fetchXFeed(handle.handle, 20);
  } else if (handle.platform === 'instagram') {
    feedData = await fetchInstagramFeed(handle.handle, 20);
  } else {
    throw new Error(`Unsupported platform: ${handle.platform}`);
  }
  
  // Update handle metadata
  if (feedData.displayName) {
    handle.displayName = feedData.displayName;
  }
  if (feedData.avatarUrl) {
    handle.avatarUrl = feedData.avatarUrl;
  }
  handle.lastFetchedAt = new Date();
  await handle.save();
  
  // Upsert posts
  let postsSaved = 0;
  for (const postData of feedData.posts) {
    try {
      await SocialPost.findOneAndUpdate(
        {
          platform: postData.platform,
          externalId: postData.externalId
        },
        {
          $set: {
            handleId: handle._id,
            handle: handle.handle,
            content: postData.content,
            title: postData.title,
            description: postData.description,
            url: postData.url,
            publishedAt: postData.publishedAt,
            author: postData.author,
            engagement: {
              likes: postData.engagement.likes || 0,
              reposts: postData.engagement.reposts || 0,
              replies: postData.engagement.replies || 0,
              views: postData.engagement.views || 0,
              comments: postData.engagement.comments || 0,
              score: postData.engagement.score || 0
            },
            metadata: postData.metadata
          }
        },
        {
          upsert: true,
          new: true
        }
      );
      postsSaved++;
    } catch (postError) {
      console.error(`Error saving post ${postData.externalId}:`, postError.message);
    }
  }
  
  return {
    handle: handle,
    postsFetched: postsSaved
  };
}

module.exports = {
  fetchFeedsForAllHandles,
  fetchFeedForHandle
};
