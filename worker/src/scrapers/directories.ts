/**
 * Wedding directory scrapers.
 * Extracts vendor profiles (planners, photographers, videographers, venues)
 * from 5 French/international wedding directories.
 *
 * Strategy: navigate to the Paris/France videographer section, wait for SPA render,
 * extract vendor cards via broad selectors + text content analysis.
 */

import { Browser, Page } from 'playwright';
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

async function extractLeadsFromPage(
  page: Page,
  directory: string,
  cardSelectors: string[],
  nameSelectors: string[],
  descSelectors: string[]
): Promise<DirectoryLead[]> {
  const leads: DirectoryLead[] = [];

  // Try each card selector until one works
  for (const cardSel of cardSelectors) {
    const cards = await page.locator(cardSel).all();
    if (cards.length === 0) continue;

    console.log(`[Directories] Found ${cards.length} cards with "${cardSel}"`);

    for (const card of cards) {
      try {
        // Extract name
        let name = '';
        for (const nameSel of nameSelectors) {
          name = (await card.locator(nameSel).first().textContent().catch(() => ''))?.trim() || '';
          if (name) break;
        }
        if (!name) continue;

        // Extract URL
        const linkEl = card.locator('a[href]').first();
        const href = await linkEl.getAttribute('href').catch(() => '') || '';
        const url = href.startsWith('http') ? href : (href ? new URL(href, page.url()).toString() : '');

        // Extract description
        let description = '';
        for (const descSel of descSelectors) {
          description = (await card.locator(descSel).first().textContent().catch(() => ''))?.trim() || '';
          if (description) break;
        }

        if (name && name.length > 1) {
          leads.push({ name, url, description, contactInfo: null, directory });
        }
      } catch {
        // Skip malformed cards
      }
    }

    if (leads.length > 0) break; // Found cards with this selector, stop trying others
  }

  return leads;
}

// ─── Individual scrapers ─────────────────────────────────────────────────────

async function scrapeMariagesNet(page: Page): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping mariages.net (Ile-de-France)...');

  try {
    await page.goto('https://www.mariages.net/video-mariage/ile-de-france', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Also try wedding planners page
    const urls = [
      page.url(), // Already on videographers
    ];

    const allLeads: DirectoryLead[] = [];

    const leads = await extractLeadsFromPage(
      page,
      'mariages.net',
      ['.storefrontSearchResult', '.vendor-card', '[class*="StorefrontCard"]', 'article', '[data-testid*="vendor"]'],
      ['h3', '.storefrontSearchResult__title', '[class*="title"]', 'a[class*="name"]', 'h2'],
      ['p', '.storefrontSearchResult__description', '[class*="description"]', '[class*="text"]']
    );
    allLeads.push(...leads);

    // If no results with selectors, try extracting all links with vendor-like patterns
    if (allLeads.length === 0) {
      const vendorLinks = await page.evaluate(() => {
        const results: { name: string; url: string }[] = [];
        document.querySelectorAll('a[href]').forEach((el) => {
          const href = (el as HTMLAnchorElement).href;
          const text = el.textContent?.trim() || '';
          // Vendor profile links usually contain the vendor slug
          if (
            href.includes('mariages.net/') &&
            !href.includes('/video-mariage/') &&
            !href.includes('/avis/') &&
            text.length > 2 &&
            text.length < 100 &&
            !text.includes('©') &&
            !text.includes('Voir plus')
          ) {
            results.push({ name: text, url: href });
          }
        });
        return results;
      });

      for (const v of vendorLinks) {
        allLeads.push({
          name: v.name,
          url: v.url,
          description: '',
          contactInfo: null,
          directory: 'mariages.net',
        });
      }

      if (vendorLinks.length > 0) {
        console.log(`[Directories] Extracted ${vendorLinks.length} vendor links from page`);
      }
    }

    console.log(`[Directories] mariages.net: ${allLeads.length} leads`);
    return allLeads;
  } catch (err) {
    console.error('[Directories] Error scraping mariages.net:', err);
    return [];
  }
}

async function scrapeWeddingWire(page: Page): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping WeddingWire France (Paris)...');

  try {
    await page.goto('https://www.weddingwire.fr/video-mariage/paris', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const leads = await extractLeadsFromPage(
      page,
      'weddingwire',
      ['.vendor-tile', '.storefrontSearchResult', '[data-testid="vendor-card"]', 'article', '[class*="Card"]'],
      ['h3', '.vendor-tile__title', 'a[class*="title"]', 'h2', '[class*="name"]'],
      ['p', '.vendor-tile__description', '[class*="description"]']
    );

    // Fallback: WeddingWire France might redirect to mariages.net
    if (leads.length === 0) {
      console.log(`[Directories] WeddingWire may have redirected to: ${page.url()}`);
      // Try generic link extraction
      const links = await page.evaluate(() => {
        const results: { name: string; url: string }[] = [];
        document.querySelectorAll('a[href]').forEach((el) => {
          const text = el.textContent?.trim() || '';
          const href = (el as HTMLAnchorElement).href;
          if (text.length > 3 && text.length < 80 && href.includes('/video') && !text.includes('Voir')) {
            results.push({ name: text, url: href });
          }
        });
        return results;
      });
      for (const l of links) {
        leads.push({ ...l, description: '', contactInfo: null, directory: 'weddingwire' });
      }
    }

    console.log(`[Directories] WeddingWire: ${leads.length} leads`);
    return leads;
  } catch (err) {
    console.error('[Directories] Error scraping WeddingWire:', err);
    return [];
  }
}

async function scrapeJunebug(page: Page): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping Junebug Weddings (France)...');

  try {
    await page.goto('https://junebugweddings.com/wedding-vendors/france/videographers', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const leads = await extractLeadsFromPage(
      page,
      'junebug',
      ['.vendor-card', '.member-card', 'article[class*="vendor"]', '[class*="VendorCard"]', '.card'],
      ['h2', 'h3', '.vendor-name', 'a[class*="name"]', '[class*="title"]'],
      ['p', '.vendor-location', '.vendor-description', '[class*="location"]']
    );

    console.log(`[Directories] Junebug: ${leads.length} leads`);
    return leads;
  } catch (err) {
    console.error('[Directories] Error scraping Junebug:', err);
    return [];
  }
}

async function scrapeOuiLove(page: Page): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping OuiLove Paris...');

  try {
    await page.goto('https://ouilove.paris/prestataires/videaste/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const leads = await extractLeadsFromPage(
      page,
      'ouilove',
      ['.vendor-item', '.listing-item', 'article', '.card', '[class*="listing"]'],
      ['h2', 'h3', '.title', 'a[class*="title"]', '[class*="name"]'],
      ['p', '.excerpt', '.description', '[class*="description"]']
    );

    console.log(`[Directories] OuiLove: ${leads.length} leads`);
    return leads;
  } catch (err) {
    console.error('[Directories] Error scraping OuiLove:', err);
    return [];
  }
}

async function scrapeCaratsAndCake(page: Page): Promise<DirectoryLead[]> {
  console.log('[Directories] Scraping Carats & Cake (France)...');

  try {
    await page.goto('https://www.caratsandcake.com/explore?location=France&category=Videographer', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Scroll to load more
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }

    const leads = await extractLeadsFromPage(
      page,
      'caratsandcake',
      ['.vendor-card', '.explore-card', '[class*="VendorCard"]', 'article', '[class*="Card"]'],
      ['h2', 'h3', '[class*="name"]', '[class*="title"]'],
      ['p', '[class*="location"]', '[class*="description"]']
    );

    console.log(`[Directories] Carats & Cake: ${leads.length} leads`);
    return leads;
  } catch (err) {
    console.error('[Directories] Error scraping Carats & Cake:', err);
    return [];
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function scrapeDirectories(browser?: Browser): Promise<void> {
  console.log('[Directories] Starting directory scrape...');

  const ownBrowser = !browser;
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    const allLeads: DirectoryLead[] = [];

    const scrapers = [
      () => scrapeMariagesNet(page),
      () => scrapeWeddingWire(page),
      () => scrapeJunebug(page),
      () => scrapeOuiLove(page),
      () => scrapeCaratsAndCake(page),
    ];

    for (const scraper of scrapers) {
      const leads = await scraper();
      allLeads.push(...leads);
      await humanDelay(2000, 4000);
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allLeads.filter((l) => {
      const key = l.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Save to DB
    let saved = 0;
    for (const lead of unique) {
      try {
        const result = await sql`
          INSERT INTO leads (
            platform, platform_id, username, full_name, bio,
            external_url, source, source_url, lead_type, scraped_at
          ) VALUES (
            'directory',
            ${`dir_${lead.directory}_${lead.name.slice(0, 100)}`},
            ${lead.name},
            ${lead.name},
            ${lead.description},
            ${lead.url},
            ${lead.directory},
            ${lead.url},
            'vendor',
            NOW()
          )
          ON CONFLICT (platform, platform_id) DO UPDATE SET
            bio = EXCLUDED.bio,
            external_url = EXCLUDED.external_url,
            scraped_at = NOW()
          RETURNING id
        `;
        if (result.length > 0) saved++;
      } catch (err) {
        console.error(`[Directories] DB error for ${lead.name}:`, err);
      }
    }

    console.log(`[Directories] Done. ${unique.length} unique vendors found, ${saved} saved/updated.`);
  } finally {
    await page.close();
    await context.close();
    if (ownBrowser) {
      await browser.close();
    }
  }
}
