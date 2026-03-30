import { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';
import { humanDelay, shouldReduceActivity } from '../lib/anti-ban.js';
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

export async function autoDM(browser?: Browser): Promise<void> {
  console.log('[DM Sender] Starting auto-DM run...');

  if (shouldReduceActivity()) {
    console.log('[DM Sender] Weekend — skipping DMs entirely');
    return;
  }

  const canDM = await checkLimit('instagram', 'dm');
  if (!canDM) {
    console.log('[DM Sender] Daily DM limit reached. Skipping.');
    return;
  }

  // Get top-scoring couple leads with drafted messages
  const leads = await sql`
    SELECT id, username, full_name, draft_message, total_score, lead_type
    FROM leads
    WHERE platform = 'instagram'
      AND lead_type = 'couple'
      AND total_score >= 50
      AND draft_message IS NOT NULL
      AND dm_sent_at IS NULL
      AND is_private = false
    ORDER BY total_score DESC
    LIMIT ${CONFIG.instagram.maxDmsPerDay}
  `;

  if (leads.length === 0) {
    console.log('[DM Sender] No eligible leads for DM');
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

  let dmsSent = 0;

  try {
    for (const lead of leads) {
      const withinLimit = await checkLimit('instagram', 'dm');
      if (!withinLimit) {
        console.log('[DM Sender] Rate limit reached during run');
        break;
      }

      try {
        console.log(`[DM Sender] Sending DM to @${lead.username}...`);

        // Navigate to Instagram Direct
        await page.goto(`https://www.instagram.com/direct/new/`, { waitUntil: 'networkidle' });
        await humanDelay(2000, 4000);

        // Search for the user
        const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="Rechercher"]');
        await searchInput.fill(lead.username);
        await humanDelay(2000, 3000);

        // Click on the user from search results
        const userResult = page.locator(`div:has-text("${lead.username}")`).first();
        await userResult.click();
        await humanDelay(1000, 2000);

        // Click "Next" or "Chat" button
        const nextBtn = page.locator('button:has-text("Next"), button:has-text("Suivant"), button:has-text("Chat")');
        if (await nextBtn.isVisible({ timeout: 3000 })) {
          await nextBtn.click();
          await humanDelay(2000, 3000);
        }

        // Type the message
        const messageInput = page.locator('textarea[placeholder*="Message"], div[role="textbox"]');
        await messageInput.click();
        await humanDelay(500, 1000);

        // Type message character by character for human-like behavior
        const message = lead.draft_message;
        await messageInput.fill(message);
        await humanDelay(1000, 2000);

        // Send the message
        const sendBtn = page.locator('button:has-text("Send"), button:has-text("Envoyer")');
        await sendBtn.click();
        await humanDelay(2000, 4000);

        // Record outreach in DB
        await sql`
          UPDATE leads SET dm_sent_at = NOW() WHERE id = ${lead.id}
        `;

        await sql`
          INSERT INTO outreach (
            lead_id, channel, message, sent_at, status
          ) VALUES (
            ${lead.id}, 'instagram_dm', ${message}, NOW(), 'sent'
          )
        `;

        await incrementCount('instagram', 'dm');
        dmsSent++;

        console.log(`[DM Sender] DM sent to @${lead.username}`);

        // Long delay between DMs for anti-ban
        await humanDelay(CONFIG.delays.instagramDm.min, CONFIG.delays.instagramDm.max);
      } catch (err) {
        console.warn(`[DM Sender] Error sending DM to @${lead.username}:`, err);
      }
    }
  } finally {
    await page.close();
    await context.close();
    if (ownBrowser) {
      await browser.close();
    }
  }

  console.log(`[DM Sender] Sent ${dmsSent} DMs`);
}
