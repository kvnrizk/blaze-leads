import { NextRequest, NextResponse } from 'next/server';
import { sendMessage } from '@/lib/telegram';
import { sql } from '@/lib/db';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

async function handleCommand(chatId: string, command: string): Promise<string> {
  switch (command) {
    case '/status': {
      let dbOk = false;
      let leadCount = 0;
      let paused = false;
      try {
        const result = await sql`SELECT COUNT(*) as count FROM leads`;
        leadCount = result[0]?.count || 0;
        dbOk = true;
        const pauseRow = await sql`SELECT value FROM system_config WHERE key = 'automation_paused'`;
        paused = pauseRow.length > 0 && pauseRow[0].value === 'true';
      } catch {
        // db unreachable
      }

      const todayLeads = dbOk
        ? (await sql`SELECT COUNT(*) as count FROM leads WHERE scraped_at >= CURRENT_DATE`)[0]?.count || 0
        : 0;

      const lastScrape = dbOk
        ? (await sql`SELECT MAX(started_at) as last FROM scrape_runs`)[0]?.last
        : null;

      return [
        '<b>🔥 Blaze Status</b>',
        '',
        `System: ✅ Running`,
        `DB: ${dbOk ? '✅ Connected' : '❌ Error'}`,
        `Automation: ${paused ? '⏸ Paused' : '▶️ Active'}`,
        `Total leads: <b>${leadCount}</b>`,
        `Today's leads: <b>${todayLeads}</b>`,
        lastScrape ? `Last scrape: ${new Date(lastScrape).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` : '',
      ].filter(Boolean).join('\n');
    }

    case '/leads': {
      const leads = await sql`
        SELECT username, lead_type, total_score, platform
        FROM leads
        WHERE scraped_at >= CURRENT_DATE AND total_score > 0
        ORDER BY total_score DESC
        LIMIT 15
      `;

      if (leads.length === 0) return 'No leads found today.';

      let msg = '<b>📋 Today\'s Leads</b>\n\n';
      for (const lead of leads) {
        const icon = lead.lead_type === 'couple' ? '💍' : lead.lead_type === 'planner' ? '📋' : lead.lead_type === 'vendor' ? '🏪' : '👤';
        msg += `${icon} @${lead.username} — ${lead.total_score}pts (${lead.lead_type})\n`;
      }
      return msg;
    }

    case '/top': {
      const leads = await sql`
        SELECT username, lead_type, total_score, platform, bio
        FROM leads
        WHERE total_score >= 30
        ORDER BY total_score DESC
        LIMIT 10
      `;

      if (leads.length === 0) return 'No high-score leads yet.';

      let msg = '<b>🏆 Top Leads (30+)</b>\n\n';
      for (const lead of leads) {
        const bio = (lead.bio || '').slice(0, 60);
        msg += `<b>@${lead.username}</b> — ${lead.total_score}pts (${lead.lead_type})\n`;
        if (bio) msg += `<i>${bio}${lead.bio?.length > 60 ? '...' : ''}</i>\n`;
        msg += '\n';
      }
      return msg;
    }

    case '/stats': {
      const total = (await sql`SELECT COUNT(*) as c FROM leads`)[0]?.c || 0;
      const thisWeek = (await sql`SELECT COUNT(*) as c FROM leads WHERE scraped_at >= CURRENT_DATE - INTERVAL '7 days'`)[0]?.c || 0;
      const couples = (await sql`SELECT COUNT(*) as c FROM leads WHERE lead_type = 'couple'`)[0]?.c || 0;
      const planners = (await sql`SELECT COUNT(*) as c FROM leads WHERE lead_type = 'planner'`)[0]?.c || 0;
      const dmsSent = (await sql`SELECT COUNT(*) as c FROM outreach WHERE channel = 'instagram_dm'`)[0]?.c || 0;
      const emailsSent = (await sql`SELECT COUNT(*) as c FROM outreach WHERE channel = 'email'`)[0]?.c || 0;

      return [
        '<b>📊 Blaze Stats</b>',
        '',
        `Total leads: <b>${total}</b>`,
        `This week: <b>${thisWeek}</b>`,
        `Couples: <b>${couples}</b>`,
        `Planners: <b>${planners}</b>`,
        '',
        `DMs sent: <b>${dmsSent}</b>`,
        `Emails sent: <b>${emailsSent}</b>`,
      ].join('\n');
    }

    case '/scrape': {
      await sql`
        UPDATE system_config SET value = 'true', updated_at = NOW()
        WHERE key = 'trigger_scrape'
      `;
      return '⏳ Manual scrape triggered! The worker will pick it up on next check.';
    }

    case '/pause': {
      await sql`
        UPDATE system_config SET value = 'true', updated_at = NOW()
        WHERE key = 'automation_paused'
      `;
      return '⏸ Automation paused. Scrapers will still run but outreach (DMs, comments, emails) is stopped. Use /resume to restart.';
    }

    case '/resume': {
      await sql`
        UPDATE system_config SET value = 'false', updated_at = NOW()
        WHERE key = 'automation_paused'
      `;
      return '▶️ Automation resumed! Outreach will continue on the next scheduled run.';
    }

    default:
      return [
        '<b>🔥 Blaze Commands</b>',
        '',
        '/status — System status',
        '/leads — Today\'s leads',
        '/top — High-score leads (30+)',
        '/stats — Overall stats',
        '/scrape — Trigger manual scrape',
        '/pause — Pause automation',
        '/resume — Resume automation',
      ].join('\n');
  }
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(update.message.chat.id);
    const text = update.message.text.trim();
    const command = text.split(' ')[0].split('@')[0].toLowerCase();

    const reply = await handleCommand(chatId, command);
    await sendMessage(chatId, reply);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
