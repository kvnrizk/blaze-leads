/**
 * Test Instagram scraper only — login + scrape 2 hashtags + enrich 5 profiles.
 * Usage: cd worker && npx tsx src/test-instagram.ts
 */
import { testConnection, initSchema } from './lib/db.js';
import { chromium } from 'playwright';
import { scrapeHashtags, enrichProfiles } from './scrapers/instagram.js';

async function main() {
  console.log('=== Instagram Scraper Test ===\n');

  const ok = await testConnection();
  if (!ok) process.exit(1);
  await initSchema();

  if (!process.env.INSTAGRAM_USERNAME || !process.env.INSTAGRAM_PASSWORD) {
    console.error('Set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD');
    process.exit(1);
  }

  console.log(`Logging in as: ${process.env.INSTAGRAM_USERNAME}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox'],
    slowMo: 500, // Slow down so you can see what's happening
  });

  try {
    console.log('\n1. Scraping hashtags...');
    const usernames = await scrapeHashtags(browser);
    console.log(`Found ${usernames.length} usernames`);

    if (usernames.length > 0) {
      const testBatch = usernames.slice(0, 5);
      console.log(`\n2. Enriching ${testBatch.length} profiles...`);
      const profiles = await enrichProfiles(browser, testBatch);
      console.log(`Enriched ${profiles.length} profiles`);

      for (const p of profiles) {
        console.log(`  @${p.username} — ${p.followers} followers — "${p.bio?.slice(0, 60) || 'no bio'}"`);
      }
    }
  } catch (err) {
    // Take screenshot on failure
    const pages = browser.contexts().flatMap(c => c.pages());
    if (pages.length > 0) {
      await pages[0].screenshot({ path: 'data/error-screenshot.png' });
      console.log('Screenshot saved to data/error-screenshot.png');
    }
    throw err;
  } finally {
    await browser.close();
  }

  console.log('\n=== Done! Check dashboard for new Instagram leads ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Instagram test failed:', err);
  process.exit(1);
});
