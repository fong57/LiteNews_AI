// services/autoNewsFetchScheduler.js
// Runs every minute; at the start of each hour, if that hour is in the admin schedule, runs fetchNewsFromAllActiveSources once.
const NewsFetchSchedule = require('../models/NewsFetchSchedule');
const { fetchNewsFromAllActiveSources } = require('./newsFetcher');

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
let lastRunHour = -1;

async function checkAndRun() {
  try {
    const now = new Date();
    const hour = now.getHours();

    const schedule = await NewsFetchSchedule.getSchedule();
    if (!schedule.scheduleHours || !schedule.scheduleHours[hour]) {
      return;
    }

    if (lastRunHour === hour) {
      return;
    }
    lastRunHour = hour;

    console.log(`[AutoNewsFetch] Running scheduled fetch at hour ${hour} (${now.toISOString()})`);
    const result = await fetchNewsFromAllActiveSources();
    console.log(`[AutoNewsFetch] Done: ${result.count} news items fetched from ${result.sourcesProcessed} sources`);

    schedule.lastRunAt = now;
    await schedule.save();
  } catch (err) {
    console.error('[AutoNewsFetch] Error:', err.message);
    lastRunHour = -1;
  }
}

function start() {
  console.log('[AutoNewsFetch] Scheduler started (checking every minute)');
  setInterval(checkAndRun, CHECK_INTERVAL_MS);
  setTimeout(checkAndRun, 30 * 1000);
}

module.exports = { start, checkAndRun };
