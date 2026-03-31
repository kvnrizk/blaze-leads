/**
 * worker/src/scrapers/instagram.ts
 *
 * Strategy:
 * 1. Persistent browser context — same fingerprint, session, and cookies every run
 * 2. THREE extraction methods tried in order:
 *    a) Response listener — passively captures Instagram's internal API responses
 *    b) Script tag extraction — reads embedded JSON from page source
 *    c) Meta tag extraction — reads og:description for basic profile info
 * 3. Manual login once via --login flag, then fully automated forever
 */

import { chromium, BrowserContext, Page, Response } from 'playwright';
import path from 'path';
import fs from 'fs';
import { sql } from '../lib/db.js';
import { humanDelay, shouldReduceActivity } from '../lib/anti-ban.js';
import { CONFIG } from '../config.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROFILE_DIR = path.resolve('./data/instagram-profile');
const COOKIES_FILE = path.resolve('./data/instagram-cookies.json');
const SCREENSHOT_DIR = path.resolve('./data');

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstagramUser {
  username: string;
  full_name: string | null;
  bio: string | null;
  followers: number;
  post_count: number;
  external_url: string | null;
  is_private: boolean;
  email: string | null;
}

interface CapturedPost {
  username: string;
  full_name?: string;
  followers?: number;
  is_private?: boolean;
}

// ─── Browser launch ───────────────────────────────────────────────────────────

async function launchContext(): Promise<BrowserContext> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(4000);

    const url = page.url();
    if (url.includes('/accounts/login')) return false;

    // If on homepage (not login), we're logged in
    if (url === 'https://www.instagram.com/' || url.startsWith('https://www.instagram.com/?')) {
      return true;
    }

    // Check for any logged-in indicator
    const indicators = [
      'nav[role="navigation"]',
      'svg[aria-label="Home"]',
      'svg[aria-label="Accueil"]',
      'a[href="/direct/inbox/"]',
      'a[href="/explore/"]',
    ];
    for (const sel of indicators) {
      if (await page.$(sel)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function loginWithCookies(context: BrowserContext): Promise<boolean> {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await context.addCookies(cookies);
    console.log('[instagram] Loaded cookies from file');
    return true;
  } catch {
    return false;
  }
}

async function saveCookies(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

async function loginWithCredentials(page: Page, context: BrowserContext): Promise<boolean> {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;
  if (!username || !password) {
    console.error('[instagram] No credentials — set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD');
    return false;
  }

  try {
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Check if we got redirected (already logged in)
    if (!page.url().includes('/accounts/login')) {
      await dismissDialogs(page);
      await saveCookies(context);
      return true;
    }

    // Try to find and fill the login form
    const usernameInput = await page.$('input[name="username"], input[type="text"]');
    if (!usernameInput) {
      console.log('[instagram] No login form found — may already be logged in');
      return !page.url().includes('/accounts/login');
    }

    await usernameInput.fill(username);
    await humanDelay(400, 900);

    const passwordInput = await page.$('input[name="password"], input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill(password);
      await humanDelay(600, 1200);
    }

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();

    await page.waitForTimeout(5000);
    await dismissDialogs(page);

    const loggedIn = !page.url().includes('/accounts/login');
    if (loggedIn) {
      await saveCookies(context);
      console.log('[instagram] Login successful');
    }
    return loggedIn;
  } catch (err) {
    console.error('[instagram] Login error:', err);
    return false;
  }
}

async function dismissDialogs(page: Page): Promise<void> {
  const dismissers = [
    'button:has-text("Tout accepter")',
    'button:has-text("Accept All")',
    'button:has-text("Allow essential and optional cookies")',
    'button:has-text("Not Now")',
    'button:has-text("Plus tard")',
    'button:has-text("Ignorer")',
    'button:has-text("Not now")',
    'button:has-text("Pas maintenant")',
  ];
  for (const selector of dismissers) {
    try {
      const btn = await page.$(selector);
      if (btn && await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }
  }
}

async function authenticate(context: BrowserContext, page: Page): Promise<boolean> {
  let loggedIn = await isLoggedIn(page);

  if (!loggedIn) {
    console.log('[instagram] Not logged in, trying cookies...');
    await loginWithCookies(context);
    loggedIn = await isLoggedIn(page);
  }

  if (!loggedIn) {
    console.log('[instagram] Trying credentials...');
    loggedIn = await loginWithCredentials(page, context);
  }

  if (!loggedIn) {
    console.error('[instagram] Cannot authenticate — aborting');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/instagram-auth-fail.png` });
  } else {
    console.log('[instagram] Authenticated ✓');
    await dismissDialogs(page);
  }

  return loggedIn;
}

// ─── Extraction methods ───────────────────────────────────────────────────────

/**
 * Method 1: Passive response listener.
 * Listens for ALL responses and extracts user data from JSON responses.
 */
function setupResponseListener(page: Page, collected: CapturedPost[]): void {
  page.on('response', async (response: Response) => {
    try {
      const url = response.url();
      const status = response.status();

      // Only process JSON responses from Instagram's API
      if (status !== 200) return;
      if (!url.includes('instagram.com')) return;

      const isApi =
        url.includes('/api/v1/') ||
        url.includes('/graphql') ||
        url.includes('/web/') ||
        url.includes('query_hash') ||
        url.includes('doc_id');

      if (!isApi) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;

      const body = await response.body().catch(() => null);
      if (!body) return;

      const json = JSON.parse(body.toString());
      const before = collected.length;
      deepExtractUsers(json, collected);

      const found = collected.length - before;
      if (found > 0) {
        const shortUrl = url.split('?')[0].split('instagram.com')[1] || url.slice(-60);
        console.log(`[instagram] +${found} users from ${shortUrl}`);
      }
    } catch {
      // Silently skip non-JSON or failed responses
    }
  });
}

/**
 * Recursively walks any JSON structure looking for objects with a `username` field
 * that look like Instagram user objects.
 */
function deepExtractUsers(obj: unknown, posts: CapturedPost[], depth = 0): void {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepExtractUsers(item, posts, depth + 1);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Check if this object looks like a user
  if (
    typeof record.username === 'string' &&
    record.username.length > 0 &&
    record.username.length < 50 &&
    !record.username.includes(' ')
  ) {
    // Verify it's likely a user object (has at least one other user-like field)
    const hasUserFields =
      'full_name' in record ||
      'follower_count' in record ||
      'is_private' in record ||
      'profile_pic_url' in record ||
      'pk' in record ||
      'pk_id' in record;

    if (hasUserFields) {
      posts.push({
        username: String(record.username),
        full_name: record.full_name ? String(record.full_name) : undefined,
        followers: record.follower_count ? Number(record.follower_count) : undefined,
        is_private: record.is_private ? Boolean(record.is_private) : undefined,
      });
      return; // Don't recurse into user's nested objects
    }
  }

  // Recurse into all values
  for (const value of Object.values(record)) {
    deepExtractUsers(value, posts, depth + 1);
  }
}

/**
 * Method 2: Extract from embedded script tags.
 * Instagram embeds initial data in script tags as JSON.
 */
async function extractFromScriptTags(page: Page): Promise<CapturedPost[]> {
  const posts: CapturedPost[] = [];

  try {
    const scripts = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('script[type="application/json"]').forEach((el) => {
        if (el.textContent && el.textContent.length > 100) {
          results.push(el.textContent);
        }
      });
      // Also check for window.__additionalDataLoaded or similar
      const allScripts = document.querySelectorAll('script:not([src])');
      allScripts.forEach((el) => {
        const text = el.textContent || '';
        if (
          text.includes('username') &&
          (text.includes('edge_hashtag_to_media') ||
            text.includes('tag_media') ||
            text.includes('sections'))
        ) {
          results.push(text);
        }
      });
      return results;
    });

    for (const scriptText of scripts) {
      try {
        // Try to parse as JSON directly
        const json = JSON.parse(scriptText);
        deepExtractUsers(json, posts);
      } catch {
        // Try to extract JSON from script content (e.g., window.__data = {...})
        const jsonMatch = scriptText.match(/\{[\s\S]*"username"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const json = JSON.parse(jsonMatch[0]);
            deepExtractUsers(json, posts);
          } catch { /* not valid JSON */ }
        }
      }
    }
  } catch {
    // Script extraction failed
  }

  return posts;
}

/**
 * Method 3: Extract usernames from post link hrefs + profile page.
 * Last resort — slower but works when API is blocked.
 */
async function extractFromDOM(page: Page): Promise<string[]> {
  try {
    // Get all post links and extract shortcodes
    const links = await page.$$eval('a[href*="/p/"]', (els) =>
      els.map((el) => el.getAttribute('href')).filter(Boolean) as string[]
    );

    // Deduplicate
    return [...new Set(links)];
  } catch {
    return [];
  }
}

// ─── Hashtag scraping ─────────────────────────────────────────────────────────

async function scrapeHashtag(page: Page, hashtag: string): Promise<CapturedPost[]> {
  const collected: CapturedPost[] = [];

  console.log(`[instagram] Scraping #${hashtag}...`);

  try {
    await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for SPA to render and fire API calls
    await page.waitForTimeout(6000 + Math.random() * 3000);
    await dismissDialogs(page);

    // Scroll to trigger more loads
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000 + Math.random() * 1000);
    }

    // Method 2: Try script tag extraction
    const scriptPosts = await extractFromScriptTags(page);
    if (scriptPosts.length > 0) {
      console.log(`[instagram] Script tags: found ${scriptPosts.length} users`);
      collected.push(...scriptPosts);
    }

    // Method 3: If still nothing, try DOM extraction for post links
    if (collected.length === 0) {
      const postLinks = await extractFromDOM(page);
      console.log(`[instagram] DOM: found ${postLinks.length} post links`);

      // Visit first few posts to get usernames from meta tags
      for (const href of postLinks.slice(0, 10)) {
        try {
          const fullUrl = href.startsWith('http')
            ? href
            : `https://www.instagram.com${href}`;
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000 + Math.random() * 1000);

          // Extract username from meta og:description or page content
          const username = await page.evaluate(() => {
            // Try meta tag: "X likes, Y comments - @username on Instagram"
            const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
            const match = ogDesc.match(/@(\w+)\s+on Instagram/i) || ogDesc.match(/- (.+?) on Instagram/i);
            if (match) return match[1].replace('@', '');

            // Try canonical link
            const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
            const canonMatch = canonical.match(/instagram\.com\/([^/]+)\/p\//);
            if (canonMatch) return canonMatch[1];

            // Try header links
            const headerLink = document.querySelector('header a[href*="/"][role="link"]');
            if (headerLink) {
              const href = headerLink.getAttribute('href');
              if (href) return href.replace(/\//g, '');
            }

            return null;
          });

          if (username && username.length < 50 && !username.includes(' ')) {
            collected.push({ username });
          }

          await humanDelay(1500, 3000);
        } catch {
          // Skip failed posts
        }
      }
    }
  } catch (err) {
    console.warn(`[instagram] Error scraping #${hashtag}:`, err);
  }

  // Deduplicate
  const seen = new Set<string>();
  return collected.filter((p) => {
    if (seen.has(p.username)) return false;
    seen.add(p.username);
    return true;
  });
}

// ─── Profile enrichment ───────────────────────────────────────────────────────

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function parseCount(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/\s/g, '').replace(',', '.');
  if (clean.includes('M')) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.includes('K') || clean.includes('k'))
    return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean, 10) || 0;
}

async function enrichProfile(page: Page, username: string): Promise<InstagramUser | null> {
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000 + Math.random() * 1500);

    const meta = await page.evaluate(() => {
      const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      return { desc, title };
    });

    const followersMatch = meta.desc.match(/([\d,.]+[KkMm]?)\s*Followers?/i);
    const postsMatch = meta.desc.match(/([\d,.]+[KkMm]?)\s*Posts?/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : 0;
    const postCount = postsMatch ? parseCount(postsMatch[1]) : 0;

    const nameMatch = meta.title.match(/^(.+?)\s*\(@/);
    const fullName = nameMatch ? nameMatch[1].trim() : null;

    // Bio: try script tag data first, then DOM
    let bio = '';
    try {
      bio = await page.evaluate(() => {
        // Try to find bio in script tags
        const scripts = document.querySelectorAll('script[type="application/json"]');
        for (const s of scripts) {
          const text = s.textContent || '';
          if (text.includes('biography')) {
            try {
              const json = JSON.parse(text);
              const bioStr = JSON.stringify(json).match(/"biography":"([^"]*?)"/);
              if (bioStr) return bioStr[1].replace(/\\n/g, '\n');
            } catch { /* skip */ }
          }
        }
        // Fallback: meta description after the counts
        const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const bioMatch = desc.match(/- (.+)/);
        return bioMatch ? bioMatch[1].trim() : '';
      });
    } catch { /* skip */ }

    const externalUrl = await page
      .$eval('a[href*="l.instagram.com"]', (el) => (el as HTMLAnchorElement).href)
      .catch(() => null);

    const isPrivate = !!(await page.$('h2:has-text("This account is private"), h2:has-text("Ce compte est privé")'));

    return {
      username,
      full_name: fullName,
      bio: bio || null,
      followers,
      post_count: postCount,
      external_url: externalUrl,
      is_private: isPrivate,
      email: extractEmailFromText(bio),
    };
  } catch (err) {
    console.warn(`[instagram] Could not enrich @${username}:`, err);
    return null;
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

async function saveLead(user: InstagramUser, sourceHashtag: string): Promise<boolean> {
  try {
    const result = await sql`
      INSERT INTO leads (
        platform, platform_id, username, full_name, bio, email,
        followers, post_count, external_url, is_private,
        source, source_url, lead_type,
        wedding_score, paris_score, quality_score, total_score,
        scraped_at, raw_data
      ) VALUES (
        'instagram',
        ${`ig_${user.username}`},
        ${user.username},
        ${user.full_name},
        ${user.bio},
        ${user.email},
        ${user.followers},
        ${user.post_count},
        ${user.external_url},
        ${user.is_private},
        ${`instagram_#${sourceHashtag}`},
        ${`https://www.instagram.com/${user.username}/`},
        'other',
        0, 0, 0, 0,
        NOW(),
        ${JSON.stringify({ source_hashtag: sourceHashtag })}
      )
      ON CONFLICT (platform, platform_id) DO NOTHING
      RETURNING id
    `;
    return result.length > 0;
  } catch (err) {
    console.error(`[instagram] DB error for @${user.username}:`, err);
    return false;
  }
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export async function scrapeInstagramHashtags(): Promise<void> {
  if (shouldReduceActivity()) {
    console.log('[instagram] Weekend — skipping hashtag scrape');
    return;
  }

  const context = await launchContext();
  const page = await context.newPage();

  // Set up passive response listener BEFORE any navigation
  const apiCollected: CapturedPost[] = [];
  setupResponseListener(page, apiCollected);

  try {
    if (!(await authenticate(context, page))) return;

    const hashtags = CONFIG.instagram.hashtags;
    const allPosts: CapturedPost[] = [];
    let totalNew = 0;

    for (const hashtag of hashtags) {
      // Reset API collector for this hashtag
      const beforeApi = apiCollected.length;

      const domPosts = await scrapeHashtag(page, hashtag);

      // Merge API-intercepted posts from this navigation
      const apiPosts = apiCollected.slice(beforeApi);
      const combined = [...domPosts, ...apiPosts];

      // Deduplicate
      const seen = new Set(allPosts.map((p) => p.username));
      const newPosts = combined.filter((p) => {
        if (seen.has(p.username)) return false;
        seen.add(p.username);
        return true;
      });

      allPosts.push(...newPosts);
      console.log(
        `[instagram] #${hashtag}: ${newPosts.length} new (${domPosts.length} DOM + ${apiPosts.length} API)`
      );

      await humanDelay(CONFIG.delays.instagram.min, CONFIG.delays.instagram.max);
    }

    console.log(`[instagram] Total unique users: ${allPosts.length}`);

    // Save all leads
    for (const post of allPosts) {
      const isNew = await saveLead(
        {
          username: post.username,
          full_name: post.full_name || null,
          bio: null,
          email: null,
          followers: post.followers || 0,
          post_count: 0,
          external_url: null,
          is_private: post.is_private || false,
        },
        'hashtag_batch'
      );
      if (isNew) totalNew++;
    }

    console.log(`[instagram] Hashtag scrape done. ${totalNew} new leads saved.`);
  } finally {
    await context.close();
  }
}

export async function enrichInstagramProfiles(): Promise<void> {
  const unenriched = await sql`
    SELECT username FROM leads
    WHERE platform = 'instagram'
      AND bio IS NULL
      AND is_private = false
    ORDER BY scraped_at DESC
    LIMIT ${CONFIG.instagram.maxProfilesPerRun}
  `;

  if (unenriched.length === 0) {
    console.log('[instagram] No profiles to enrich');
    return;
  }

  console.log(`[instagram] Enriching ${unenriched.length} profiles...`);

  const context = await launchContext();
  const page = await context.newPage();

  try {
    if (!(await authenticate(context, page))) return;

    let enriched = 0;

    for (const row of unenriched) {
      const username = (row as Record<string, string>).username;
      const profile = await enrichProfile(page, username);

      if (profile) {
        await sql`
          UPDATE leads SET
            full_name = ${profile.full_name},
            bio = ${profile.bio},
            email = ${profile.email},
            followers = ${profile.followers},
            post_count = ${profile.post_count},
            external_url = ${profile.external_url},
            is_private = ${profile.is_private}
          WHERE platform = 'instagram'
            AND platform_id = ${`ig_${username}`}
        `;
        enriched++;
        console.log(`[instagram] ✓ @${username} (${profile.followers} followers)`);
      }

      await humanDelay(CONFIG.delays.instagram.min, CONFIG.delays.instagram.max);
    }

    console.log(`[instagram] Enrichment done. ${enriched}/${unenriched.length} updated.`);
  } finally {
    await context.close();
  }
}

// ─── Manual login utility ─────────────────────────────────────────────────────

if (process.argv.includes('--login')) {
  (async () => {
    console.log('Opening browser for manual login...');
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
    });
    const page = await context.newPage();
    await page.goto('https://www.instagram.com/accounts/login/');
    console.log('Log in manually in the browser, then press Enter here...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
    await saveCookies(context);
    console.log('Profile + cookies saved. You can now run headless.');
    await context.close();
    process.exit(0);
  })();
}
