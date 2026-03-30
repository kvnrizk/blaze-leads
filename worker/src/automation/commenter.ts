import { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';
import { humanDelay, randomComment, shouldReduceActivity } from '../lib/anti-ban.js';
import { checkLimit, incrementCount } from '../lib/rate-limiter.js';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve('data/instagram-cookies.json');

async function loadCookies(context: BrowserContext): Promise<boolean> {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      return true;
    }
  } catch {
    // No cookies
  }
  return false;
}

export async function autoComment(browser?: Browser): Promise<void> {
  console.log('[Commenter] Starting auto-comment run...');

  if (shouldReduceActivity()) {
    console.log('[Commenter] Weekend — reducing activity by 50%');
  }

  const canComment = await checkLimit('instagram', 'comment');
  if (!canComment) {
    console.log('[Commenter] Daily comment limit reached. Skipping.');
    return;
  }

  // Get high-score leads with recent posts to comment on
  const leads = await sql`
    SELECT id, username, platform_id, source_url
    FROM leads
    WHERE platform = 'instagram'
      AND total_score >= 40
      AND commented_at IS NULL
    ORDER BY total_score DESC
    LIMIT ${shouldReduceActivity() ? 5 : CONFIG.instagram.maxCommentsPerDay}
  `;

  if (leads.length === 0) {
    console.log('[Commenter] No eligible leads for commenting');
    return;
  }

  const ownBrowser = !browser;
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();
  await loadCookies(context);

  let commentsPosted = 0;

  try {
    for (const lead of leads) {
      const withinLimit = await checkLimit('instagram', 'comment');
      if (!withinLimit) {
        console.log('[Commenter] Rate limit reached during run');
        break;
      }

      try {
        // Navigate to the user's profile and find their latest post
        await page.goto(`https://www.instagram.com/${lead.username}/`, { waitUntil: 'networkidle' });
        await humanDelay(CONFIG.delays.instagram.min, CONFIG.delays.instagram.max);

        // Click on the first post
        const firstPost = page.locator('article a[href*="/p/"]').first();
        if (!(await firstPost.isVisible({ timeout: 5000 }))) {
          console.log(`[Commenter] No visible posts for @${lead.username}`);
          continue;
        }

        await firstPost.click();
        await humanDelay(2000, 4000);

        // Find and click the comment input
        const commentInput = page.locator('textarea[aria-label*="comment"], textarea[aria-label*="commentaire"], textarea[placeholder*="comment"]');
        if (!(await commentInput.isVisible({ timeout: 5000 }))) {
          console.log(`[Commenter] Comments disabled for @${lead.username}'s post`);
          continue;
        }

        await commentInput.click();
        await humanDelay(1000, 2000);

        // Type the comment with human-like timing
        const comment = randomComment();
        await commentInput.fill(comment);
        await humanDelay(1000, 2000);

        // Submit the comment
        const postBtn = page.locator('button:has-text("Post"), button:has-text("Publier")');
        await postBtn.click();
        await humanDelay(2000, 4000);

        // Record in DB
        await sql`
          UPDATE leads SET commented_at = NOW() WHERE id = ${lead.id}
        `;
        await incrementCount('instagram', 'comment');
        commentsPosted++;

        console.log(`[Commenter] Commented on @${lead.username}'s post`);

        // Long delay between comments for anti-ban
        await humanDelay(CONFIG.delays.instagramComment.min, CONFIG.delays.instagramComment.max);
      } catch (err) {
        console.warn(`[Commenter] Error commenting on @${lead.username}:`, err);
      }
    }
  } finally {
    await page.close();
    await context.close();
    if (ownBrowser) {
      await browser.close();
    }
  }

  console.log(`[Commenter] Posted ${commentsPosted} comments`);
}
