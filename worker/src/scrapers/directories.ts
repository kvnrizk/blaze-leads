import { Browser } from 'playwright';
import { chromium } from 'playwright';
import { sql } from '../lib/db.js';
import { humanDelay } from '../lib/anti-ban.js';

interface DirectoryLead {
  name: string;
  url: string;
  description: string;
  contactInfo: string | null;
  directory: string;
}

async function scrapeMariagesNet(browser: Browser): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping mariages.net (Ile-de-France)...');
  const leads: DirectoryLead[] = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Scrape videographers in Ile-de-France region
    await page.goto('https://www.mariages.net/video-mariage/ile-de-france', { waitUntil: 'networkidle' });
    await humanDelay(3000, 5000);

    // Extract vendor cards
    const vendorCards = await page.locator('.vendor-card, .storefrontSearchResult').all();

    for (const card of vendorCards) {
      try {
        const name = await card.locator('h3, .storefrontSearchResult__title').textContent() || '';
        const linkEl = card.locator('a[href]').first();
        const url = await linkEl.getAttribute('href') || '';
        const description = await card.locator('.storefrontSearchResult__description, p').first().textContent() || '';

        leads.push({
          name: name.trim(),
          url: url.startsWith('http') ? url : `https://www.mariages.net${url}`,
          description: description.trim(),
          contactInfo: null,
          directory: 'mariages.net',
        });
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[Directories] Found ${leads.length} vendors on mariages.net`);
  } catch (err) {
    console.error('[Directories] Error scraping mariages.net:', err);
  }

  await page.close();
  await context.close();
  return leads;
}

async function scrapeWeddingWire(browser: Browser): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping WeddingWire France (Paris)...');
  const leads: DirectoryLead[] = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www.weddingwire.fr/video-mariage/paris', { waitUntil: 'networkidle' });
    await humanDelay(3000, 5000);

    const vendorCards = await page.locator('.vendor-tile, .storefrontSearchResult, [data-testid="vendor-card"]').all();

    for (const card of vendorCards) {
      try {
        const name = await card.locator('h3, .vendor-tile__title, a[class*="title"]').first().textContent() || '';
        const linkEl = card.locator('a[href]').first();
        const url = await linkEl.getAttribute('href') || '';
        const description = await card.locator('p, .vendor-tile__description').first().textContent() || '';

        if (name.trim()) {
          leads.push({
            name: name.trim(),
            url: url.startsWith('http') ? url : `https://www.weddingwire.fr${url}`,
            description: description.trim(),
            contactInfo: null,
            directory: 'weddingwire',
          });
        }
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[Directories] Found ${leads.length} vendors on WeddingWire`);
  } catch (err) {
    console.error('[Directories] Error scraping WeddingWire:', err);
  }

  await page.close();
  await context.close();
  return leads;
}

async function scrapeJunebug(browser: Browser): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping Junebug Weddings (France)...');
  const leads: DirectoryLead[] = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://junebugweddings.com/wedding-vendors/france/videographers', { waitUntil: 'networkidle' });
    await humanDelay(3000, 5000);

    const vendorCards = await page.locator('.vendor-card, .member-card, article[class*="vendor"]').all();

    for (const card of vendorCards) {
      try {
        const name = await card.locator('h2, h3, .vendor-name, a[class*="name"]').first().textContent() || '';
        const linkEl = card.locator('a[href]').first();
        const url = await linkEl.getAttribute('href') || '';
        const description = await card.locator('p, .vendor-location, .vendor-description').first().textContent() || '';

        if (name.trim()) {
          leads.push({
            name: name.trim(),
            url: url.startsWith('http') ? url : `https://junebugweddings.com${url}`,
            description: description.trim(),
            contactInfo: null,
            directory: 'junebug',
          });
        }
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[Directories] Found ${leads.length} vendors on Junebug`);
  } catch (err) {
    console.error('[Directories] Error scraping Junebug:', err);
  }

  await page.close();
  await context.close();
  return leads;
}

async function scrapeOuiLove(browser: Browser): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping OuiLove Paris...');
  const leads: DirectoryLead[] = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://ouilove.paris/prestataires/videaste/', { waitUntil: 'networkidle' });
    await humanDelay(3000, 5000);

    const vendorCards = await page.locator('.vendor-item, .listing-item, article, .card').all();

    for (const card of vendorCards) {
      try {
        const name = await card.locator('h2, h3, .title, a[class*="title"]').first().textContent() || '';
        const linkEl = card.locator('a[href]').first();
        const url = await linkEl.getAttribute('href') || '';
        const description = await card.locator('p, .excerpt, .description').first().textContent() || '';

        if (name.trim()) {
          leads.push({
            name: name.trim(),
            url: url.startsWith('http') ? url : `https://ouilove.paris${url}`,
            description: description.trim(),
            contactInfo: null,
            directory: 'ouilove',
          });
        }
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[Directories] Found ${leads.length} vendors on OuiLove`);
  } catch (err) {
    console.error('[Directories] Error scraping OuiLove:', err);
  }

  await page.close();
  await context.close();
  return leads;
}

async function scrapeCaratsAndCake(browser: Browser): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping Carats & Cake (Europe/France)...');
  const leads: DirectoryLead[] = [];

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://www.caratsandcake.com/explore?location=France&category=Videographer', { waitUntil: 'networkidle' });
    await humanDelay(3000, 5000);

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await humanDelay(2000, 3000);
    }

    const vendorCards = await page.locator('.vendor-card, .explore-card, [class*="VendorCard"], article').all();

    for (const card of vendorCards) {
      try {
        const name = await card.locator('h2, h3, [class*="name"], [class*="title"]').first().textContent() || '';
        const linkEl = card.locator('a[href]').first();
        const url = await linkEl.getAttribute('href') || '';
        const description = await card.locator('p, [class*="location"], [class*="description"]').first().textContent() || '';

        if (name.trim()) {
          leads.push({
            name: name.trim(),
            url: url.startsWith('http') ? url : `https://www.caratsandcake.com${url}`,
            description: description.trim(),
            contactInfo: null,
            directory: 'caratsandcake',
          });
        }
      } catch {
        // Skip malformed cards
      }
    }

    console.log(`[Directories] Found ${leads.length} vendors on Carats & Cake`);
  } catch (err) {
    console.error('[Directories] Error scraping Carats & Cake:', err);
  }

  await page.close();
  await context.close();
  return leads;
}

export async function scrapeDirectories(browser?: Browser): Promise<void> {
  console.log('[Directories] Starting directory scrape...');

  const ownBrowser = !browser;
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  try {
    const allLeads: DirectoryLead[] = [];

    const mariagesLeads = await scrapeMariagesNet(browser);
    allLeads.push(...mariagesLeads);

    const wwLeads = await scrapeWeddingWire(browser);
    allLeads.push(...wwLeads);

    const junebugLeads = await scrapeJunebug(browser);
    allLeads.push(...junebugLeads);

    const ouiLeads = await scrapeOuiLove(browser);
    allLeads.push(...ouiLeads);

    const ccLeads = await scrapeCaratsAndCake(browser);
    allLeads.push(...ccLeads);

    // Save all leads to DB
    for (const lead of allLeads) {
      await sql`
        INSERT INTO leads (
          platform, platform_id, username, full_name, bio,
          external_url, source, scraped_at
        ) VALUES (
          'directory',
          ${`dir_${lead.directory}_${lead.name}`},
          ${lead.name},
          ${lead.name},
          ${lead.description},
          ${lead.url},
          ${lead.directory},
          NOW()
        )
        ON CONFLICT (platform, platform_id) DO UPDATE SET
          bio = EXCLUDED.bio,
          external_url = EXCLUDED.external_url,
          scraped_at = NOW()
      `;
    }

    console.log(`[Directories] Scrape complete. ${allLeads.length} leads saved.`);
  } finally {
    if (ownBrowser) {
      await browser.close();
    }
  }
}
