import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const source = searchParams.get('source');
    const leadType = searchParams.get('lead_type');
    const minScore = searchParams.get('min_score');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = `SELECT * FROM leads WHERE 1=1`;
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (source) {
      query += ` AND platform = $${paramIdx++}`;
      params.push(source);
    }
    if (leadType) {
      query += ` AND lead_type = $${paramIdx++}`;
      params.push(leadType);
    }
    if (minScore) {
      query += ` AND total_score >= $${paramIdx++}`;
      params.push(parseFloat(minScore));
    }

    query += ` ORDER BY total_score DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const leads = await sql(query, params);

    return NextResponse.json({ leads, count: leads.length });
  } catch (err) {
    console.error('Leads API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
