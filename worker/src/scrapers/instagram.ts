import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';
import { humanDelay, shouldReduceActivity } from '../lib/anti-ban.js';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_PATH = path.resolve('data/instagram-cookies.json');

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
      console.log('[Instagram] Loaded saved cookies');
      return true;
    }
  } catch (err) {
    console.warn('[Instagram] Failed to load cookies:', err);
  }
  return false;
}

async function saveCookies(context: BrowserContext): Promise<void> {
  await ensureDataDir();
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('[Instagram] Saved cookies');
}

async function dismissDialogs(page: Page): Promise<void> {
  // Dismiss cookie banner
  try {
    const cookieBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept"), button:has-text("Autoriser")');
    if (await cookieBtn.isVisible({ timeout: 3000 })) {
      await cookieBtn.click();
      await humanDelay(1000, 2000);
    }
  } catch { /* No cookie banner */ }

  // Dismiss "Save Login Info" / "One Tap" dialog
  try {
    const notNow = page.locator('button:has-text("Not Now"), button:has-text("Pas maintenant"), button:has-text("Not now")');
    if (await notNow.isVisible({ timeout: 3000 })) {
      await notNow.click();
      await humanDelay(1000, 2000);
    }
  } catch { /* No dialog */ }

  // Dismiss notifications dialog
  try {
    const notNow = page.locator('button:has-text("Not Now"), button:has-text("Plus tard")');
    if (await notNow.isVisible({ timeout: 3000 })) {
      await notNow.click();
      await humanDelay(1000, 2000);
    }
  } catch { /* No dialog */ }
}

async function login(page: Page, context: BrowserContext): Promise<void> {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;

  if (!username || !password) {
    throw new Error('INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD are required');
  }

  console.log('[Instagram] Logging in...');
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await humanDelay(3000, 5000);

  // Wait for redirect to settle — Instagram may redirect if already logged in
  const currentUrl = page.url();
  console.log('[Instagram] Current URL after navigation: ' + currentUrl);
  if (!currentUrl.includes('/accounts/login')) {
    console.log('[Instagram] Already logged in (redirected to: ' + currentUrl + ')');
    await dismissDialogs(page);
    await saveCookies(context);
    return;
  }

  // Check if login form actually exists — if not, we're logged in
  const loginFormVisible = await page.locator('input[name="username"], input[type="text"]').first().isVisible({ timeout: 5000 }).catch(() => false);
  if (!loginFormVisible) {
    console.log('[Instagram] No login form found — already logged in');
    await dismissDialogs(page);
    await saveCookies(context);
    return;
  }

  await dismissDialogs(page);

  // Fill login form
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
  await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
  await usernameInput.clear();
  await usernameInput.fill(username);
  await humanDelay(500, 1000);
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.fill(password);
  await humanDelay(500, 1000);

  // Click login button
  const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")').first();
  await loginBtn.click();
  console.log('[Instagram] Clicked login button, waiting for navigation...');

  // Wait up to 30s for page to leave login
  try {
    await page.waitForURL((url) => !url.toString().includes('/accounts/login'), { timeout: 30000 });
  } catch {
    // Check if we're still on login — might be wrong password
    const stillOnLogin = page.url().includes('/accounts/login');
    if (stillOnLogin) {
      const errorMsg = await page.locator('#slfErrorAlert, [role="alert"], p[data-testid="login-error-message"]').textContent().catch(() => '');
      throw new Error(`Login failed — still on login page. Error: ${errorMsg || 'unknown'}`);
    }
  }
  await humanDelay(3000, 5000);

  // Handle post-login dialogs
  await dismissDialogs(page);

  await saveCookies(context);
  console.log('[Instagram] Login successful');
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(3000, 5000);
    await dismissDialogs(page);
    // If we're on the homepage (not redirected to login), we're logged in
    const url = page.url();
    if (url.includes('/accounts/login')) return false;
    // Double-check with a visual element
    const loggedIn = await page.locator('svg[aria-label="Home"], svg[aria-label="Accueil"], a[href="/"]').first().isVisible({ timeout: 5000 });
    return loggedIn;
  } catch {
    return false;
  }
}

interface InstagramProfile {
  username: string;
  bio: string;
  followers: number;
  posts: number;
  fullName: string;
  isPrivate: boolean;
  externalUrl: string | null;
  email: string | null;
}

export async function scrapeHashtags(browser: Browser): Promise<string[]> {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();
  const hasCookies = await loadCookies(context);

  if (!hasCookies || !(await isLoggedIn(page))) {
    await login(page, context);
  } else {
    console.log('[Instagram] Already logged in via cookies');
    await saveCookies(context);
  }

  const usernames = new Set<string>();
  const hashtags = CONFIG.instagram.hashtags;
  const maxPosts = CONFIG.instagram.maxPostsPerHashtag;
  const reduceActivity = shouldReduceActivity();

  for (const hashtag of hashtags) {
    if (reduceActivity && Math.random() > 0.5) {
      console.log(`[Instagram] Skipping #${hashtag} (weekend reduction)`);
      continue;
    }

    console.log(`[Instagram] Scraping #${hashtag}...`);
    try {
      await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for SPA content to render
      await humanDelay(5000, 8000);
      await dismissDialogs(page);

      // Extract post shortcodes from the grid links
      const postLinks = await page.locator('a[href*="/p/"]').all();
      console.log(`[Instagram] Found ${postLinks.length} post links on #${hashtag}`);

      // Collect all hrefs first (fast, no navigation)
      const hrefs: string[] = [];
      for (const link of postLinks.slice(0, maxPosts)) {
        const href = await link.getAttribute('href').catch(() => null);
        if (href) hrefs.push(href);
      }

      // For each post, fetch the JSON endpoint to get the author
      for (const href of hrefs) {
        try {
          const jsonUrl = `https://www.instagram.com${href}?__a=1&__d=dis`;
          const resp = await page.evaluate(async (url: string) => {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) return null;
            return r.json();
          }, jsonUrl);

          if (resp?.items?.[0]?.user?.username) {
            usernames.add(resp.items[0].user.username);
          } else if (resp?.graphql?.shortcode_media?.owner?.username) {
            usernames.add(resp.graphql.shortcode_media.owner.username);
          }
        } catch {
          // JSON endpoint blocked — fall back to page scraping
          try {
            await page.goto(`https://www.instagram.com${href}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await humanDelay(2000, 3000);
            // Try to extract username from page meta or header
            const metaContent = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => '');
            const ownerMatch = metaContent?.match(/^[\d,.]+ likes, [\d,.]+ comments - (.+?) on Instagram/i);
            if (ownerMatch) {
              // Extract from "X on Instagram" — not the username but close
            }
            // Try header link
            const authorHref = await page.locator('a[href*="/"][role="link"] span').first().textContent().catch(() => '');
            if (authorHref && !authorHref.includes(' ')) {
              usernames.add(authorHref);
            }
          } catch {
            // Skip this post
          }
        }

        if (usernames.size >= CONFIG.instagram.maxProfilesPerRun) break;
        await humanDelay(1000, 2000);
      }
    } catch (err) {
      console.warn(`[Instagram] Error scraping #${hashtag}:`, err);
    }

    if (usernames.size >= CONFIG.instagram.maxProfilesPerRun) break;
  }

  await page.close();
  await context.close();

  console.log(`[Instagram] Found ${usernames.size} unique profiles from hashtags`);
  return Array.from(usernames);
}

export async function enrichProfiles(browser: Browser, usernames: string[]): Promise<InstagramProfile[]> {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();
  await loadCookies(context);

  const profiles: InstagramProfile[] = [];

  for (const username of usernames) {
    try {
      console.log(`[Instagram] Enriching @${username}...`);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDelay(CONFIG.delays.instagram.min, CONFIG.delays.instagram.max);

      // Extract profile data from meta tags and page content
      const fullName = await page.locator('header section h2, header section h1').first().textContent() || '';

      const bioElement = page.locator('header section > div:nth-child(3) span, header section div.-vDIg span');
      const bio = await bioElement.first().textContent() || '';

      // Extract follower/post counts from meta description or stats
      const metaDesc = await page.locator('meta[property="og:description"]').getAttribute('content') || '';
      const followerMatch = metaDesc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
      const postMatch = metaDesc.match(/([\d,.]+)\s*Posts/i);

      const followers = parseCount(followerMatch?.[1] || '0');
      const posts = parseCount(postMatch?.[1] || '0');

      // Check if profile is private
      const isPrivate = await page.locator('h2:has-text("This account is private"), h2:has-text("Ce compte est privé")').isVisible({ timeout: 2000 }).catch(() => false);

      // Extract external URL
      const externalUrlElement = page.locator('header a[rel="me nofollow noopener noreferrer"]');
      const externalUrl = await externalUrlElement.getAttribute('href').catch(() => null);

      // Try to extract email from bio
      const emailMatch = bio.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const email = emailMatch ? emailMatch[0] : null;

      const profile: InstagramProfile = {
        username,
        bio,
        followers,
        posts,
        fullName,
        isPrivate,
        externalUrl,
        email,
      };

      profiles.push(profile);

      // Save to DB
      await sql`
        INSERT INTO leads (
          platform, platform_id, username, full_name, bio,
          followers, post_count, external_url, email,
          is_private, source, scraped_at
        ) VALUES (
          'instagram', ${username}, ${username}, ${fullName}, ${bio},
          ${followers}, ${posts}, ${externalUrl}, ${email},
          ${isPrivate}, 'hashtag_scrape', NOW()
        )
        ON CONFLICT (platform, platform_id) DO UPDATE SET
          bio = EXCLUDED.bio,
          followers = EXCLUDED.followers,
          post_count = EXCLUDED.post_count,
          external_url = EXCLUDED.external_url,
          email = EXCLUDED.email,
          scraped_at = NOW()
      `;
    } catch (err) {
      console.warn(`[Instagram] Error enriching @${username}:`, err);
    }
  }

  await page.close();
  await context.close();

  console.log(`[Instagram] Enriched ${profiles.length} profiles`);
  return profiles;
}

function parseCount(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '');
  const multiplier = cleaned.match(/[KkMm]/);
  const num = parseFloat(cleaned.replace(/[KkMm]/g, ''));
  if (multiplier) {
    const m = multiplier[0].toLowerCase();
    if (m === 'k') return Math.round(num * 1000);
    if (m === 'm') return Math.round(num * 1000000);
  }
  return Math.round(num);
}

export async function scrapeInstagram(): Promise<void> {
  console.log('[Instagram] Starting scrape run...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const usernames = await scrapeHashtags(browser);
    await enrichProfiles(browser, usernames);
    console.log('[Instagram] Scrape run complete');
  } finally {
    await browser.close();
  }
}
