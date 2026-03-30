/**
 * Opens Instagram in a browser. You log in manually.
 * When done, press Enter in this terminal to save cookies.
 *
 * Usage: cd worker && npx tsx src/save-login.ts
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

async function main() {
  console.log('Opening Instagram — log in manually in the browser window.');
  console.log('Press Enter here when you are logged in.\n');

  const dataDir = path.resolve('data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/');

  // Wait for user to press Enter
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question('Press Enter after you have logged in...', () => resolve()));
  rl.close();

  // Save cookies
  const cookies = await context.cookies();
  fs.writeFileSync(path.resolve('data/instagram-cookies.json'), JSON.stringify(cookies, null, 2));
  console.log(`Saved ${cookies.length} cookies to data/instagram-cookies.json`);

  await browser.close();
  console.log('Done! Now run: npx tsx src/test-instagram.ts');
}

main().catch(console.error);
