import { testConnection, initSchema } from './lib/db.js';
import { scrapeDirectories } from './scrapers/directories.js';
import { scoreAllUnscored } from './ai/scorer.js';

async function main() {
  console.log('=== Directory Scraper Test ===\n');
  await testConnection();
  await initSchema();

  console.log('Scraping 5 wedding directories...\n');
  await scrapeDirectories();

  console.log('\nScoring new leads...');
  let total = 0, batch = 1;
  while (batch > 0) { batch = await scoreAllUnscored(); total += batch; }
  console.log(`Scored ${total} new leads`);

  process.exit(0);
}
main().catch((err) => { console.error('Failed:', err); process.exit(1); });
