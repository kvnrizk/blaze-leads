import { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';
import { humanDelay, shouldReduceActivity } from '../lib/anti-ban.js';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve('data/facebook-cookies.json');

async function ensureDataDir() {
  const dir = path.resolve('data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function loadCookies(context: BrowserContext): Promise<boolean> {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      console.log('[Facebook] Loaded saved cookies');
      return true;
    }
  } catch (err) {
    console.warn('[Facebook] Failed to load cookies:', err);
  }
  return false;
}

async function saveCookies(context: BrowserContext): Promise<void> {
  await ensureDataDir();
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('[Facebook] Saved cookies');
}

async function loginFacebook(page: Page, context: BrowserContext): Promise<void> {
  const email = process.env.FACEBOOK_EMAIL;
  const password = process.env.FACEBOOK_PASSWORD;

  if (!email || !password) {
    throw new Error('FACEBOOK_EMAIL and FACEBOOK_PASSWORD are required');
  }

  console.log('[Facebook] Logging in...');
  await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
  await humanDelay(2000, 4000);

  // Accept cookies if prompted
  try {
    const acceptBtn = page.locator('button[data-cookiebanner="accept_button"], button:has-text("Accept All")');
    if (await acceptBtn.isVisible({ timeout: 3000 })) {
      await acceptBtn.click();
      await humanDelay(1000, 2000);
    }
  } catch {
    // No cookie banner
  }

  await page.fill('#email', email);
  await humanDelay(500, 1000);
  await page.fill('#pass', password);
  await humanDelay(500, 1000);
  await page.click('button[name="login"]');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
  await humanDelay(3000, 5000);

  await saveCookies(context);
  console.log('[Facebook] Login successful');
}

interface FacebookPost {
  authorName: string;
  content: string;
  engagement: number;
  groupUrl: string;
}

function isWeddingRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [...CONFIG.scoring.weddingKeywords, ...CONFIG.scoring.parisKeywords];
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

async function scrapeGroup(page: Page, groupUrl: string): Promise<FacebookPost[]> {
  console.log(`[Facebook] Scraping group: ${groupUrl}`);
  const posts: FacebookPost[] = [];

  try {
    await page.goto(groupUrl, { waitUntil: 'networkidle' });
    await humanDelay(CONFIG.delays.facebook.min, CONFIG.delays.facebook.max);

    // Scroll down a few times to load more posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await humanDelay(3000, 5000);
    }

    // Extract posts from the feed
    const postElements = await page.locator('[role="article"]').all();

    for (const postEl of postElements.slice(0, 20)) {
      try {
        // Get post text content
        const textEl = postEl.locator('[data-ad-preview="message"], [dir="auto"]').first();
        const content = await textEl.textContent() || '';

        if (!content.trim()) continue;

        // Get author name
        const authorEl = postEl.locator('strong > span, h3 a > strong > span').first();
        const authorName = await authorEl.textContent() || 'Unknown';

        // Get engagement (reactions count)
        const reactionsEl = postEl.locator('[aria-label*="reaction"], [aria-label*="réaction"]').first();
        const reactionsText = await reactionsEl.textContent().catch(() => '0');
        const engagement = parseInt(reactionsText || '0', 10) || 0;

        const post: FacebookPost = {
          authorName: authorName.trim(),
          content: content.trim().slice(0, 1000),
          engagement,
          groupUrl,
        };

        // Flag posts mentioning wedding/mariage keywords
        if (isWeddingRelevant(post.content)) {
          posts.push(post);
        }
      } catch {
        // Skip malformed posts
      }
    }

    console.log(`[Facebook] Found ${posts.length} relevant posts in group`);
  } catch (err) {
    console.error(`[Facebook] Error scraping group ${groupUrl}:`, err);
  }

  return posts;
}

export async function scrapeFacebook(browser?: Browser): Promise<void> {
  console.log('[Facebook] Starting scrape run...');

  if (shouldReduceActivity()) {
    console.log('[Facebook] Weekend — skipping Facebook scrape');
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

  try {
    const hasCookies = await loadCookies(context);
    if (!hasCookies) {
      await loginFacebook(page, context);
    } else {
      // Verify we're logged in
      await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });
      await humanDelay(2000, 3000);
      const loginBtn = page.locator('button[name="login"], a[href*="/login"]');
      if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginFacebook(page, context);
      }
    }

    const allPosts: FacebookPost[] = [];

    for (const groupUrl of CONFIG.facebook.groups) {
      const posts = await scrapeGroup(page, groupUrl);
      allPosts.push(...posts);
      await humanDelay(CONFIG.delays.facebook.min, CONFIG.delays.facebook.max);
    }

    // Save leads to DB
    for (const post of allPosts) {
      await sql`
        INSERT INTO leads (
          platform, platform_id, username, bio,
          source, source_url, scraped_at
        ) VALUES (
          'facebook',
          ${`fb_${post.authorName}_${Date.now()}`},
          ${post.authorName},
          ${post.content},
          'facebook_group',
          ${post.groupUrl},
          NOW()
        )
        ON CONFLICT (platform, platform_id) DO NOTHING
      `;
    }

    console.log(`[Facebook] Scrape complete. ${allPosts.length} leads saved.`);
  } finally {
    await page.close();
    await context.close();
    if (ownBrowser) {
      await browser.close();
    }
  }
}
