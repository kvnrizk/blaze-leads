import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = neon(DATABASE_URL);

export async function testConnection() {
  try {
    await sql`SELECT 1`;
    console.log('[DB] Connected to Neon Postgres');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    return false;
  }
}

export async function initSchema() {
  // Leads table
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(20) NOT NULL,
      platform_id VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      bio TEXT,
      email VARCHAR(255),
      followers INTEGER DEFAULT 0,
      post_count INTEGER DEFAULT 0,
      external_url TEXT,
      is_private BOOLEAN DEFAULT false,
      source VARCHAR(255),
      source_url TEXT,
      lead_type VARCHAR(20) DEFAULT 'other',
      wedding_score REAL DEFAULT 0,
      paris_score REAL DEFAULT 0,
      quality_score REAL DEFAULT 0,
      total_score REAL DEFAULT 0,
      scored_at TIMESTAMPTZ,
      draft_message TEXT,
      drafted_at TIMESTAMPTZ,
      commented_at TIMESTAMPTZ,
      dm_sent_at TIMESTAMPTZ,
      email_sent_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB,
      UNIQUE(platform, platform_id)
    )
  `;

  // Outreach tracking
  await sql`
    CREATE TABLE IF NOT EXISTS outreach (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      channel VARCHAR(30) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      message TEXT,
      sent_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Scrape runs
  await sql`
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id SERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      leads_found INTEGER NOT NULL DEFAULT 0,
      leads_new INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      error TEXT
    )
  `;

  // Rate limits
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(30) NOT NULL,
      action VARCHAR(50) NOT NULL,
      daily_count INTEGER NOT NULL DEFAULT 0,
      daily_limit INTEGER NOT NULL DEFAULT 100,
      reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(platform, action)
    )
  `;

  // Seed defaults
  await sql`
    INSERT INTO rate_limits (platform, action, daily_limit)
    VALUES
      ('instagram', 'scrape', 300),
      ('instagram', 'comment', 10),
      ('instagram', 'dm', 5),
      ('email', 'send', 20),
      ('reddit', 'scrape', 500),
      ('facebook', 'scrape', 100)
    ON CONFLICT (platform, action) DO NOTHING
  `;

  // System config
  await sql`
    CREATE TABLE IF NOT EXISTS system_config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO system_config (key, value)
    VALUES
      ('automation_paused', 'false'),
      ('trigger_scrape', 'false')
    ON CONFLICT (key) DO NOTHING
  `;

  console.log('[DB] Schema initialized');
}
