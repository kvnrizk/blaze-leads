const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(
  chatId: string,
  text: string,
  parseMode: string = 'HTML'
): Promise<boolean> {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });

  return res.ok;
}

export async function sendDailyReport(
  leads: { total: number; new_today: number; top_score: number },
  outreachStats: { sent: number; replied: number; booked: number }
): Promise<boolean> {
  const text = [
    '<b>📊 Blaze Daily Report</b>',
    '',
    `<b>Leads:</b>`,
    `  Total: ${leads.total}`,
    `  New today: ${leads.new_today}`,
    `  Top score: ${leads.top_score}`,
    '',
    `<b>Outreach:</b>`,
    `  Sent: ${outreachStats.sent}`,
    `  Replied: ${outreachStats.replied}`,
    `  Booked: ${outreachStats.booked}`,
  ].join('\n');

  return sendMessage(CHAT_ID, text);
}
