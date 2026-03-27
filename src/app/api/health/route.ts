import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  let dbStatus = 'connected';

  try {
    await sql`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: dbStatus,
  });
}
