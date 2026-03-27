import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendDigestEmail } from '@/lib/email';
import type { Lead } from '@/lib/types';

export async function POST(request: NextRequest) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const leads = (await sql`
      SELECT * FROM leads
      WHERE scraped_at >= NOW() - INTERVAL '7 days'
      ORDER BY total_score DESC
      LIMIT 100
    `) as Lead[];

    const to = process.env.SAM_EMAIL;
    if (!to) {
      return NextResponse.json({ error: 'SAM_EMAIL not configured' }, { status: 500 });
    }

    const result = await sendDigestEmail(
      to,
      `Blaze Weekly Digest — ${leads.length} leads`,
      leads
    );

    if (!result.success) {
      console.error('Digest email failed:', result.error);
      return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      leads_count: leads.length,
      sent_to: to,
    });
  } catch (err) {
    console.error('Digest error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
