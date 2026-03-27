import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      source_url TEXT,
      username VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      bio TEXT,
      email VARCHAR(255),
      followers INTEGER,
      posts_count INTEGER,
      lead_type VARCHAR(20) NOT NULL DEFAULT 'other',
      wedding_score REAL NOT NULL DEFAULT 0,
      paris_score REAL NOT NULL DEFAULT 0,
      quality_score REAL NOT NULL DEFAULT 0,
      total_score REAL NOT NULL DEFAULT 0,
      found_via VARCHAR(255),
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB,
      UNIQUE(source, username)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS outreach (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      channel VARCHAR(30) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      message_draft TEXT,
      message_sent TEXT,
      sent_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

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

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(30) NOT NULL,
      action VARCHAR(50) NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      max_per_window INTEGER NOT NULL DEFAULT 100,
      UNIQUE(platform, action)
    )
  `;
}
