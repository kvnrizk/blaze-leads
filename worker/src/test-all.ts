/**
 * Test ALL safe scrapers (no login required) + scoring + drafting.
 * Usage: cd worker && set /a && npx tsx src/test-all.ts
 */
import { testConnection, initSchema } from './lib/db.js';
import { scrapeReddit } from './scrapers/reddit.js';
import { scrapeBlogs } from './scrapers/blogs.js';
import { scoreAllUnscored } from './ai/scorer.js';
import { draftAllUndrafted } from './ai/drafter.js';

async function main() {
  console.log('=== Blaze Full Test Run ===');
  console.log(`Started: ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}\n`);

  // 1. DB
  console.log('━━━ Step 1: Database ━━━');
  const ok = await testConnection();
  if (!ok) {
    console.error('DB connection failed. Check DATABASE_URL.');
    process.exit(1);
  }
  await initSchema();

  // 2. Reddit (safe — public JSON API)
  console.log('\n━━━ Step 2: Reddit Scraper ━━━');
  await scrapeReddit();

  // 3. Blogs (safe — public HTTP)
  console.log('\n━━━ Step 3: Blog Scraper ━━━');
  await scrapeBlogs();

  // 4. Score all
  console.log('\n━━━ Step 4: Lead Scoring ━━━');
  const scored = await scoreAllUnscored();
  console.log(`Scored ${scored} leads total`);

  // 5. AI Draft messages (needs ANTHROPIC_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\n━━━ Step 5: AI Message Drafting ━━━');
    const drafted = await draftAllUndrafted();
    console.log(`Drafted ${drafted} messages`);
  } else {
    console.log('\n━━━ Step 5: Skipping AI drafting (no ANTHROPIC_API_KEY) ━━━');
  }

  // 6. Summary
  const { sql } = await import('./lib/db.js');
  const total = (await sql`SELECT COUNT(*) as c FROM leads`)[0]?.c || 0;
  const couples = (await sql`SELECT COUNT(*) as c FROM leads WHERE lead_type = 'couple'`)[0]?.c || 0;
  const planners = (await sql`SELECT COUNT(*) as c FROM leads WHERE lead_type = 'planner'`)[0]?.c || 0;
  const vendors = (await sql`SELECT COUNT(*) as c FROM leads WHERE lead_type = 'vendor'`)[0]?.c || 0;
  const hot = (await sql`SELECT COUNT(*) as c FROM leads WHERE total_score >= 30`)[0]?.c || 0;
  const drafted = (await sql`SELECT COUNT(*) as c FROM leads WHERE draft_message IS NOT NULL`)[0]?.c || 0;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RESULTS');
  console.log(`  Total leads:  ${total}`);
  console.log(`  💍 Couples:   ${couples}`);
  console.log(`  📋 Planners:  ${planners}`);
  console.log(`  🏪 Vendors:   ${vendors}`);
  console.log(`  🔥 Hot (30+): ${hot}`);
  console.log(`  📝 Drafted:   ${drafted}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nCheck dashboard: http://localhost:3003/dashboard');

  process.exit(0);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
