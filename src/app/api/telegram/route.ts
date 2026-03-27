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
      try {
        await sql`SELECT 1`;
        dbOk = true;
      } catch {
        // db unreachable
      }
      return `<b>Blaze Status</b>\nSystem: Running\nDB: ${dbOk ? 'Connected' : 'Error'}`;
    }
    case '/leads':
      return 'Coming soon — will show recent leads';
    case '/top':
      return 'Coming soon — will show top scored leads';
    case '/scrape':
      return 'Coming soon — will trigger a scrape run';
    case '/stats':
      return 'Coming soon — will show scrape & outreach stats';
    case '/pause':
      return 'Coming soon — will pause all scrapers';
    case '/resume':
      return 'Coming soon — will resume scrapers';
    default:
      return [
        '<b>Blaze Commands</b>',
        '/status — System status',
        '/leads — Recent leads',
        '/top — Top scored leads',
        '/scrape — Trigger scrape',
        '/stats — Stats overview',
        '/pause — Pause scrapers',
        '/resume — Resume scrapers',
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
