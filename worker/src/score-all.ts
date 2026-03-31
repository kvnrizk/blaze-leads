import { testConnection } from './lib/db.js';
import { scoreAllUnscored } from './ai/scorer.js';

async function main() {
  await testConnection();
  let total = 0;
  let batch = 1;
  while (batch > 0) {
    batch = await scoreAllUnscored();
    total += batch;
  }
  console.log(`All done. Scored ${total} leads.`);
  process.exit(0);
}
main();
