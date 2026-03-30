/**
 * Quick test: init DB schema, run Reddit scraper, score leads.
 * Usage: cd worker && npx tsx src/test-run.ts
 */
import { testConnection, initSchema } from './lib/db.js';
import { scrapeReddit } from './scrapers/reddit.js';
import { scoreAllUnscored } from './ai/scorer.js';

async function main() {
  console.log('=== Blaze Test Run ===\n');

  // 1. Connect + init schema
  console.log('1. Testing DB connection...');
  const ok = await testConnection();
  if (!ok) {
    console.error('DB connection failed. Check DATABASE_URL in .env.local');
    process.exit(1);
  }

  console.log('2. Initializing schema...');
  await initSchema();

  // 2. Run Reddit scraper (safest — public API, no login)
  console.log('\n3. Running Reddit scraper...');
  await scrapeReddit();

  // 3. Score the leads
  console.log('\n4. Scoring leads...');
  const scored = await scoreAllUnscored();
  console.log(`   Scored ${scored} leads`);

  console.log('\n=== Done! Check your dashboard at http://localhost:3001/dashboard ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
