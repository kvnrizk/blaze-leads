import { Resend } from 'resend';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';
import { checkLimit, incrementCount } from '../lib/rate-limiter.js';
import { shouldReduceActivity } from '../lib/anti-ban.js';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailLead {
  id: number;
  username: string;
  full_name: string;
  email: string;
  lead_type: string;
  draft_message: string;
  total_score: number;
}

function buildEmailSubject(lead: EmailLead): string {
  const subjects: Record<string, string> = {
    planner: 'Collaboration vidéo mariage cinématique — Paris',
    vendor: 'Partenariat créatif — Vidéo mariage Paris',
    creator: 'Collab vidéo mariage — Paris',
    couple: 'Votre mariage en vidéo cinématique — Paris',
    other: 'Vidéo de mariage cinématique à Paris',
  };

  return subjects[lead.lead_type] || subjects.other;
}

function buildEmailBody(lead: EmailLead): string {
  const name = lead.full_name || lead.username;

  return `Bonjour ${name},

${lead.draft_message}

Cordialement,
Sam — Blaze Wedding Films
Paris, France

---
Si ce message ne vous concerne pas, je m'en excuse. Répondez "stop" pour ne plus recevoir de messages.`;
}

export async function autoEmail(): Promise<void> {
  console.log('[Emailer] Starting auto-email run...');

  if (shouldReduceActivity()) {
    console.log('[Emailer] Weekend — reducing email volume by 50%');
  }

  const canEmail = await checkLimit('email', 'send');
  if (!canEmail) {
    console.log('[Emailer] Daily email limit reached. Skipping.');
    return;
  }

  const maxEmails = shouldReduceActivity()
    ? Math.floor(CONFIG.email.maxPerDay / 2)
    : CONFIG.email.maxPerDay;

  // Get leads with email addresses and drafted messages
  const leads = await sql`
    SELECT id, username, full_name, email, lead_type, draft_message, total_score
    FROM leads
    WHERE email IS NOT NULL
      AND email != ''
      AND draft_message IS NOT NULL
      AND email_sent_at IS NULL
      AND lead_type IN ('planner', 'vendor', 'creator')
      AND total_score >= 30
    ORDER BY total_score DESC
    LIMIT ${maxEmails}
  `;

  if (leads.length === 0) {
    console.log('[Emailer] No eligible leads for email outreach');
    return;
  }

  let emailsSent = 0;

  for (const lead of leads) {
    const withinLimit = await checkLimit('email', 'send');
    if (!withinLimit) {
      console.log('[Emailer] Rate limit reached during run');
      break;
    }

    const emailLead = lead as unknown as EmailLead;

    try {
      const subject = buildEmailSubject(emailLead);
      const body = buildEmailBody(emailLead);

      const { error } = await resend.emails.send({
        from: 'Sam <sam@blazeweddingfilms.com>',
        to: emailLead.email,
        subject,
        text: body,
      });

      if (error) {
        console.warn(`[Emailer] Error sending to ${emailLead.email}:`, error);
        continue;
      }

      // Record outreach in DB
      await sql`
        UPDATE leads SET email_sent_at = NOW() WHERE id = ${emailLead.id}
      `;

      await sql`
        INSERT INTO outreach (
          lead_id, channel, message, sent_at, status
        ) VALUES (
          ${emailLead.id}, 'email', ${body}, NOW(), 'sent'
        )
      `;

      await incrementCount('email', 'send');
      emailsSent++;

      console.log(`[Emailer] Email sent to ${emailLead.email} (${emailLead.lead_type})`);

      // Delay between emails
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`[Emailer] Error sending to ${emailLead.email}:`, err);
    }
  }

  console.log(`[Emailer] Sent ${emailsSent} emails`);
}
