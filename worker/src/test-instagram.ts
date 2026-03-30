/**
 * Test Instagram scraper — API interception + profile enrichment.
 * Usage: cd worker && npx tsx src/test-instagram.ts
 *
 * First-time setup: npx tsx src/scrapers/instagram.ts --login
 */
import { testConnection, initSchema } from './lib/db.js';
import { scrapeInstagramHashtags, enrichInstagramProfiles } from './scrapers/instagram.js';

async function main() {
  console.log('=== Instagram Scraper Test ===\n');

  const ok = await testConnection();
  if (!ok) process.exit(1);
  await initSchema();

  console.log('1. Scraping hashtags via API interception...');
  await scrapeInstagramHashtags();

  console.log('\n2. Enriching profiles...');
  await enrichInstagramProfiles();

  console.log('\n=== Done! Check dashboard for Instagram leads ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Instagram test failed:', err);
  process.exit(1);
});
