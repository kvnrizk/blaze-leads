import { sql } from '../lib/db.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Telegram] Failed to send message:', err);
  }
}

export async function sendDailyReport(): Promise<void> {
  console.log('[Telegram] Generating daily report...');

  try {
    // Today's new leads by platform
    const leadsByPlatform = await sql`
      SELECT platform, COUNT(*) as count
      FROM leads
      WHERE scraped_at >= CURRENT_DATE
      GROUP BY platform
      ORDER BY count DESC
    `;

    // Today's scored leads
    const scoredLeads = await sql`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE total_score >= 50) as hot,
             COUNT(*) FILTER (WHERE total_score >= 30 AND total_score < 50) as warm,
             COUNT(*) FILTER (WHERE total_score < 30) as cold
      FROM leads
      WHERE scored_at >= CURRENT_DATE
    `;

    // Today's outreach
    const outreach = await sql`
      SELECT channel, COUNT(*) as count
      FROM outreach
      WHERE sent_at >= CURRENT_DATE
      GROUP BY channel
    `;

    // Top 5 leads today
    const topLeads = await sql`
      SELECT username, lead_type, total_score, platform
      FROM leads
      WHERE scraped_at >= CURRENT_DATE AND total_score IS NOT NULL
      ORDER BY total_score DESC
      LIMIT 5
    `;

    // Build report
    const today = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let report = `🔥 <b>Blaze Daily Report</b>\n📅 ${today}\n\n`;

    // New leads section
    report += `<b>📊 New Leads</b>\n`;
    if (leadsByPlatform.length === 0) {
      report += `No new leads today.\n`;
    } else {
      for (const row of leadsByPlatform) {
        const icon = getPlatformIcon(row.platform);
        report += `${icon} ${row.platform}: <b>${row.count}</b>\n`;
      }
    }

    // Scoring section
    if (scoredLeads.length > 0) {
      const s = scoredLeads[0];
      report += `\n<b>🎯 Lead Scoring</b>\n`;
      report += `🔴 Hot (50+): <b>${s.hot}</b>\n`;
      report += `🟡 Warm (30-49): <b>${s.warm}</b>\n`;
      report += `⚪ Cold (<30): <b>${s.cold}</b>\n`;
    }

    // Outreach section
    report += `\n<b>📤 Outreach</b>\n`;
    if (outreach.length === 0) {
      report += `No outreach today.\n`;
    } else {
      for (const row of outreach) {
        report += `• ${row.channel}: <b>${row.count}</b> sent\n`;
      }
    }

    // Top leads section
    if (topLeads.length > 0) {
      report += `\n<b>⭐ Top Leads</b>\n`;
      for (const lead of topLeads) {
        report += `• @${lead.username} (${lead.lead_type}) — ${lead.total_score}pts [${lead.platform}]\n`;
      }
    }

    // Drafted messages ready for Sam to copy-paste
    const drafts = await sql`
      SELECT username, lead_type, total_score, draft_message, platform
      FROM leads
      WHERE drafted_at >= CURRENT_DATE
        AND dm_sent_at IS NULL
        AND draft_message IS NOT NULL
      ORDER BY total_score DESC
      LIMIT 5
    `;

    if (drafts.length > 0) {
      report += `\n<b>📝 Ready to Send (copy-paste)</b>\n`;
      for (const d of drafts) {
        const handle = d.platform === 'instagram' ? `@${d.username}` : d.username;
        report += `\n<b>${handle}</b> (${d.lead_type}, ${d.total_score}pts):\n`;
        report += `<i>${d.draft_message}</i>\n`;
      }
    }

    report += `\n🤖 <i>Blaze Worker — automated lead generation</i>`;

    await sendTelegram(report);
    console.log('[Telegram] Daily report sent');
  } catch (err) {
    console.error('[Telegram] Error sending daily report:', err);
    await sendTelegram(`⚠️ Blaze Worker: Error generating daily report.\n${err}`);
  }
}

function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    instagram: '📸',
    reddit: '🟠',
    facebook: '📘',
    directory: '📂',
    blog: '📝',
  };
  return icons[platform] || '•';
}
