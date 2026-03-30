import cron from 'node-cron';
import { CONFIG } from './config.js';
import { sql } from './lib/db.js';
import { scrapeInstagramHashtags, enrichInstagramProfiles } from './scrapers/instagram.js';
import { scrapeReddit } from './scrapers/reddit.js';
import { scrapeDirectories } from './scrapers/directories.js';
import { scrapeFacebook } from './scrapers/facebook.js';
import { scrapeBlogs } from './scrapers/blogs.js';
import { scoreAllUnscored } from './ai/scorer.js';
import { draftAllUndrafted } from './ai/drafter.js';
import { autoComment } from './automation/commenter.js';
import { autoDM } from './automation/dm-sender.js';
import { autoEmail } from './automation/emailer.js';
import { sendDailyReport } from './delivery/telegram.js';

const tz = CONFIG.schedule.timezone;

async function isAutomationPaused(): Promise<boolean> {
  try {
    const rows = await sql`SELECT value FROM system_config WHERE key = 'automation_paused'`;
    return rows.length > 0 && rows[0].value === 'true';
  } catch {
    return false;
  }
}

async function checkAndClearScrapeTriger(): Promise<boolean> {
  try {
    const rows = await sql`SELECT value FROM system_config WHERE key = 'trigger_scrape'`;
    if (rows.length > 0 && rows[0].value === 'true') {
      await sql`UPDATE system_config SET value = 'false', updated_at = NOW() WHERE key = 'trigger_scrape'`;
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function runAllScrapers(): Promise<void> {
  await safeRun('Instagram Hashtags', scrapeInstagramHashtags);
  await safeRun('Instagram Profiles', enrichInstagramProfiles);
  await safeRun('Reddit', scrapeReddit);
  await safeRun('Directories', () => scrapeDirectories());
  await safeRun('Facebook', () => scrapeFacebook());
  await safeRun('Blogs', scrapeBlogs);
  await safeRun('Scoring + Drafting', async () => {
    await scoreAllUnscored();
    await draftAllUndrafted();
  });
}

async function safeRun(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`[Scheduler] Starting: ${name}`);
  const start = Date.now();
  try {
    await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Scheduler] Completed: ${name} (${elapsed}s)`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[Scheduler] Failed: ${name} (${elapsed}s)`, err);
  }
}

export function startScheduler(): void {
  console.log('[Scheduler] Setting up cron jobs (timezone: Europe/Paris)...');

  // 06:00 — Instagram hashtag scrape (API interception)
  cron.schedule('0 6 * * *', () => safeRun('Instagram Hashtags', scrapeInstagramHashtags), {
    timezone: tz,
  });

  // 06:45 — Instagram profile enrichment (visits each profile for bio/followers)
  cron.schedule('45 6 * * *', () => safeRun('Instagram Profiles', enrichInstagramProfiles), {
    timezone: tz,
  });

  // 07:15 — Reddit scrape
  cron.schedule('15 7 * * *', () => safeRun('Reddit', scrapeReddit), {
    timezone: tz,
  });

  // 07:30 — Directory scrape
  cron.schedule('30 7 * * *', () => safeRun('Directories', () => scrapeDirectories()), {
    timezone: tz,
  });

  // 08:00 — Facebook group scrape
  cron.schedule('0 8 * * *', () => safeRun('Facebook', () => scrapeFacebook()), {
    timezone: tz,
  });

  // 08:30 — Blog comment scrape
  cron.schedule('30 8 * * *', () => safeRun('Blogs', scrapeBlogs), {
    timezone: tz,
  });

  // 09:00 — Lead scoring + AI message drafting
  cron.schedule('0 9 * * *', () => safeRun('Scoring + Drafting', async () => {
    await scoreAllUnscored();
    await draftAllUndrafted();
  }), {
    timezone: tz,
  });

  // 09:30 — Auto-comment on Instagram (disabled by default — protect Sam's account)
  cron.schedule('30 9 * * *', async () => {
    if (!CONFIG.instagram.autoCommentEnabled) {
      console.log('[Scheduler] Skipping Auto-Comment — disabled in config (account safety)');
      return;
    }
    if (await isAutomationPaused()) {
      console.log('[Scheduler] Skipping Auto-Comment — automation paused');
      return;
    }
    await safeRun('Auto-Comment', () => autoComment());
  }, { timezone: tz });

  // 10:00 — Auto-DM on Instagram (disabled by default — protect Sam's account)
  cron.schedule('0 10 * * *', async () => {
    if (!CONFIG.instagram.autoDmEnabled) {
      console.log('[Scheduler] Skipping Auto-DM — disabled in config (account safety)');
      return;
    }
    if (await isAutomationPaused()) {
      console.log('[Scheduler] Skipping Auto-DM — automation paused');
      return;
    }
    await safeRun('Auto-DM', () => autoDM());
  }, { timezone: tz });

  // 10:15 — Auto-email (checks pause flag)
  cron.schedule('15 10 * * *', async () => {
    if (await isAutomationPaused()) {
      console.log('[Scheduler] Skipping Auto-Email — automation paused');
      return;
    }
    await safeRun('Auto-Email', autoEmail);
  }, { timezone: tz });

  // 10:30 — Daily report to Sam via Telegram
  cron.schedule('30 10 * * *', () => safeRun('Daily Report', sendDailyReport), {
    timezone: tz,
  });

  // Every 5 minutes — check for manual /scrape trigger from Telegram
  cron.schedule('*/5 * * * *', async () => {
    const triggered = await checkAndClearScrapeTriger();
    if (triggered) {
      console.log('[Scheduler] Manual scrape triggered via /scrape command!');
      await runAllScrapers();
      await safeRun('Daily Report (manual)', sendDailyReport);
    }
  }, { timezone: tz });

  console.log('[Scheduler] All cron jobs registered:');
  console.log('  06:00  Instagram Hashtags');
  console.log('  06:45  Instagram Profiles');
  console.log('  07:15  Reddit');
  console.log('  07:30  Directories');
  console.log('  08:00  Facebook');
  console.log('  08:30  Blogs');
  console.log('  09:00  Scoring + Drafting');
  console.log('  09:30  Auto-Comment (pause-aware)');
  console.log('  10:00  Auto-DM (pause-aware)');
  console.log('  10:15  Auto-Email (pause-aware)');
  console.log('  10:30  Daily Report');
  console.log('  */5    Manual scrape trigger poll');
}
