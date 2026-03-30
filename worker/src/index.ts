import { testConnection, initSchema } from './lib/db.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  console.log('=================================');
  console.log('  Blaze Worker starting...');
  console.log('=================================');
  console.log('');

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }

  // Initialize schema (creates tables if not exist)
  await initSchema();

  // Start the scheduler
  startScheduler();

  console.log('');
  console.log('Blaze Worker ready. Next scrape at 06:00 Paris time.');
  console.log('');

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nBlaze Worker shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nBlaze Worker shutting down...');
    process.exit(0);
  });

  // Prevent the process from exiting
  setInterval(() => {
    // Heartbeat — keeps the event loop alive
  }, 60000);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
