/**
 * worker/src/scrapers/instagram.ts
 *
 * Strategy:
 * 1. Persistent browser context — same fingerprint, session, and cookies every run
 * 2. API interception — captures Instagram's internal GraphQL responses to extract
 *    usernames reliably, without scraping unstable DOM selectors
 * 3. Manual login once via `npm run save-login`, then fully automated forever
 */

import { chromium, BrowserContext, Page } from 'playwright';
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
  // Ensure profile dir exists
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

  // Stealth: remove webdriver flag
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
    console.log(`[instagram] isLoggedIn check — URL: ${url}`);

    // If redirected to login, definitely not logged in
    if (url.includes('/accounts/login')) return false;

    // If we're on the homepage or any non-login page, we're logged in
    // Try multiple indicators
    const indicators = [
      'nav[role="navigation"]',
      'svg[aria-label="Home"]',
      'svg[aria-label="Accueil"]',
      'a[href="/direct/inbox/"]',
      'a[href="/explore/"]',
      'span[role="link"]',
    ];

    for (const selector of indicators) {
      const el = await page.$(selector);
      if (el) {
        console.log(`[instagram] Logged in — found: ${selector}`);
        return true;
      }
    }

    // If URL is instagram.com (not login) and page has content, assume logged in
    if (url === 'https://www.instagram.com/' || url.startsWith('https://www.instagram.com/?')) {
      console.log('[instagram] On homepage without login redirect — assuming logged in');
      return true;
    }

    console.log('[instagram] Could not confirm login status');
    return false;
  } catch (err) {
    console.log('[instagram] isLoggedIn error:', err);
    return false;
  }
}

async function loginWithCookies(context: BrowserContext): Promise<boolean> {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  try {
    const raw = fs.readFileSync(COOKIES_FILE, 'utf-8');
    const cookies = JSON.parse(raw);
    await context.addCookies(cookies);
    console.log('[instagram] Loaded cookies from file');
    return true;
  } catch {
    console.log('[instagram] Cookie file invalid, skipping');
    return false;
  }
}

async function saveCookies(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log('[instagram] Cookies saved');
}

async function loginWithCredentials(page: Page, context: BrowserContext): Promise<boolean> {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;
  if (!username || !password) {
    console.error('[instagram] No credentials in environment — set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD');
    return false;
  }

  try {
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await humanDelay(1000, 2000);

    await page.fill('input[name="username"]', username);
    await humanDelay(400, 900);
    await page.fill('input[name="password"]', password);
    await humanDelay(600, 1200);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(4000);
    await dismissDialogs(page);

    const loggedIn = await isLoggedIn(page);
    if (loggedIn) {
      await saveCookies(context);
      console.log('[instagram] Login successful, session saved');
    } else {
      console.error('[instagram] Login failed — check credentials or 2FA');
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
  ];
  for (const selector of dismissers) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }
  }
}

// ─── API interception ─────────────────────────────────────────────────────────

async function interceptHashtagAPI(
  page: Page,
  collectedPosts: CapturedPost[]
): Promise<void> {
  await page.route('**', async (route) => {
    const url = route.request().url();

    if (
      url.includes('/api/v1/tags/') ||
      url.includes('/api/v1/feed/tag/') ||
      url.includes('/graphql/query') ||
      url.includes('tag_media') ||
      url.includes('sections')
    ) {
      try {
        const response = await route.fetch();
        const contentType = response.headers()['content-type'] || '';
        const status = response.status();

        if (contentType.includes('json') && status === 200) {
          const json = await response.json().catch(() => null);
          if (json) {
            const before = collectedPosts.length;
            extractUsersFromResponse(json, collectedPosts);
            const found = collectedPosts.length - before;
            if (found > 0) {
              console.log(`[instagram] API intercepted: ${found} users from ${url.split('?')[0].slice(-60)}`);
            }
          }
        }

        await route.fulfill({ response });
      } catch {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });
}

function extractUsersFromResponse(json: unknown, posts: CapturedPost[]): void {
  const data = json as Record<string, unknown>;

  // Pattern 1: /api/v1/tags/{tag}/sections/
  if (data.sections && Array.isArray(data.sections)) {
    for (const section of data.sections as Record<string, unknown>[]) {
      const medias =
        (section.layout_content as Record<string, unknown>)?.medias;
      if (Array.isArray(medias)) {
        for (const item of medias as Record<string, unknown>[]) {
          const user = (item.media as Record<string, unknown>)?.user as
            | Record<string, unknown>
            | undefined;
          if (user?.username) {
            posts.push({
              username: String(user.username),
              full_name: user.full_name ? String(user.full_name) : undefined,
              followers: user.follower_count
                ? Number(user.follower_count)
                : undefined,
              is_private: Boolean(user.is_private),
            });
          }
        }
      }
    }
  }

  // Pattern 2: GraphQL edge_hashtag_to_media
  const hashtag = data.data as Record<string, unknown> | undefined;
  const edges =
    (
      (hashtag?.hashtag as Record<string, unknown>)
        ?.edge_hashtag_to_media as Record<string, unknown>
    )?.edges;
  if (Array.isArray(edges)) {
    for (const edge of edges as Record<string, unknown>[]) {
      const node = edge.node as Record<string, unknown> | undefined;
      const owner = node?.owner as Record<string, unknown> | undefined;
      if (owner?.username) {
        posts.push({ username: String(owner.username) });
      }
    }
  }

  // Pattern 3: flat items array (newer API versions)
  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items as Record<string, unknown>[]) {
      const user = item.user as Record<string, unknown> | undefined;
      if (user?.username) {
        posts.push({
          username: String(user.username),
          full_name: user.full_name ? String(user.full_name) : undefined,
          followers: user.follower_count
            ? Number(user.follower_count)
            : undefined,
          is_private: Boolean(user.is_private),
        });
      }
    }
  }
}

// ─── Hashtag scraping ─────────────────────────────────────────────────────────

async function scrapeHashtag(
  page: Page,
  hashtag: string
): Promise<CapturedPost[]> {
  const collectedPosts: CapturedPost[] = [];

  await interceptHashtagAPI(page, collectedPosts);

  console.log(`[instagram] Scraping #${hashtag}`);
  try {
    await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for SPA to fire API calls
    await page.waitForTimeout(6000 + Math.random() * 3000);

    // Scroll to trigger more API loads
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(3000);

    console.log(`[instagram] Intercepted ${collectedPosts.length} posts so far`);

  } catch (err) {
    console.warn(`[instagram] Navigation warning for #${hashtag}:`, err);
  }

  await page.unroute('**');

  // Deduplicate by username
  const seen = new Set<string>();
  return collectedPosts.filter((p) => {
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

async function enrichProfile(
  page: Page,
  username: string
): Promise<InstagramUser | null> {
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000 + Math.random() * 1500);

    const meta = await page.evaluate(() => {
      const desc =
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const title =
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      return { desc, title };
    });

    const followersMatch = meta.desc.match(/([\d,.]+[KkMm]?)\s*Followers?/i);
    const postsMatch = meta.desc.match(/([\d,.]+[KkMm]?)\s*Posts?/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : 0;
    const postCount = postsMatch ? parseCount(postsMatch[1]) : 0;

    const nameMatch = meta.title.match(/^(.+?)\s*\(@/);
    const fullName = nameMatch ? nameMatch[1].trim() : null;

    const bio = await page
      .$eval(
        'section main header section > div:last-child, [data-testid="user-bio"], .-vDIg',
        (el) => el.textContent?.trim() || ''
      )
      .catch(() => '');

    const externalUrl = await page
      .$eval('a[href*="l.instagram.com"]', (el) =>
        (el as HTMLAnchorElement).href
      )
      .catch(() => null);

    const isPrivate = await page
      .$('h2:has-text("This account is private"), h2:has-text("Ce compte est privé")')
      .then((el) => !!el)
      .catch(() => false);

    const email = extractEmailFromText(bio);

    return {
      username,
      full_name: fullName,
      bio: bio || null,
      followers,
      post_count: postCount,
      external_url: externalUrl,
      is_private: isPrivate,
      email,
    };
  } catch (err) {
    console.warn(`[instagram] Could not enrich @${username}:`, err);
    return null;
  }
}

// ─── Database save ─────────────────────────────────────────────────────────────

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
        ${`instagram_hashtag_${sourceHashtag}`},
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
    console.error(`[instagram] DB save error for @${user.username}:`, err);
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

  try {
    let loggedIn = await isLoggedIn(page);

    if (!loggedIn) {
      console.log('[instagram] Not logged in via profile, trying cookies...');
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
      return;
    }

    console.log('[instagram] Authenticated ✓');
    await dismissDialogs(page);

    const hashtags = CONFIG.instagram.hashtags;
    const allUsernames = new Set<string>();
    let totalNew = 0;

    for (const hashtag of hashtags) {
      const posts = await scrapeHashtag(page, hashtag);
      console.log(`[instagram] #${hashtag}: captured ${posts.length} users via API interception`);

      for (const post of posts) {
        allUsernames.add(post.username);
      }

      await humanDelay(
        CONFIG.delays.instagram.min,
        CONFIG.delays.instagram.max
      );
    }

    console.log(`[instagram] Total unique usernames: ${allUsernames.size}`);

    for (const username of allUsernames) {
      const isNew = await saveLead(
        {
          username,
          full_name: null,
          bio: null,
          email: null,
          followers: 0,
          post_count: 0,
          external_url: null,
          is_private: false,
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
    let loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      await loginWithCookies(context);
      loggedIn = await isLoggedIn(page);
    }
    if (!loggedIn) {
      loggedIn = await loginWithCredentials(page, context);
    }
    if (!loggedIn) {
      console.error('[instagram] Cannot authenticate for enrichment');
      return;
    }

    await dismissDialogs(page);
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

      await humanDelay(
        CONFIG.delays.instagram.min,
        CONFIG.delays.instagram.max
      );
    }

    console.log(`[instagram] Enrichment done. ${enriched}/${unenriched.length} updated.`);
  } finally {
    await context.close();
  }
}

// ─── One-time manual login utility ───────────────────────────────────────────

if (process.argv.includes('--login')) {
  (async () => {
    console.log('Opening browser for manual login...');
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
