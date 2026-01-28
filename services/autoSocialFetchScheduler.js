// services/autoSocialFetchScheduler.js
// Runs every minute; at the start of each hour, if that hour is in the admin schedule, runs fetchFeedsForAllHandles once.
const SocialFetchSchedule = require('../models/SocialFetchSchedule');
const { fetchFeedsForAllHandles } = require('./socialFeedFetcher');

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
let lastRunHour = -1;

async function checkAndRun() {
  try {
    const now = new Date();
    const hour = now.getHours(); // 0-23 local time

    const schedule = await SocialFetchSchedule.getSchedule();
    if (!schedule.scheduleHours || !schedule.scheduleHours[hour]) {
      return;
    }

    // Run only once per hour (avoid re-running if check runs again in same hour)
    if (lastRunHour === hour) {
      return;
    }
    lastRunHour = hour;

    console.log(`[AutoSocialFetch] Running scheduled fetch at hour ${hour} (${now.toISOString()})`);
    // fetchFeedsForAllHandles() only fetches handles where isActive === true
    const results = await fetchFeedsForAllHandles();
    console.log(`[AutoSocialFetch] Done: ${results.total} active handles processed, ${results.success} succeeded, ${results.failed} failed, ${results.postsFetched} posts fetched`);
    
    // Update lastRunAt timestamp
    schedule.lastRunAt = now;
    await schedule.save();
  } catch (err) {
    console.error('[AutoSocialFetch] Error:', err.message);
    lastRunHour = -1; // Allow retry next minute
  }
}

function start() {
  console.log('[AutoSocialFetch] Scheduler started (checking every minute)');
  setInterval(checkAndRun, CHECK_INTERVAL_MS);
  // Run once after 30s so first scheduled hour can trigger soon
  setTimeout(checkAndRun, 30 * 1000);
}

module.exports = { start, checkAndRun };
