import { sql } from './db.js';

export async function checkLimit(platform: string, action: string): Promise<boolean> {
  await resetIfNewDay(platform, action);

  const rows = await sql`
    SELECT daily_count, daily_limit
    FROM rate_limits
    WHERE platform = ${platform} AND action = ${action}
  `;

  if (rows.length === 0) return true;

  const { daily_count, daily_limit } = rows[0];
  return daily_count < daily_limit;
}

export async function incrementCount(platform: string, action: string): Promise<void> {
  await sql`
    UPDATE rate_limits
    SET daily_count = daily_count + 1, updated_at = NOW()
    WHERE platform = ${platform} AND action = ${action}
  `;
}

export async function resetIfNewDay(platform: string, action: string): Promise<void> {
  await sql`
    UPDATE rate_limits
    SET daily_count = 0, reset_date = CURRENT_DATE, updated_at = NOW()
    WHERE platform = ${platform}
      AND action = ${action}
      AND reset_date < CURRENT_DATE
  `;
}
