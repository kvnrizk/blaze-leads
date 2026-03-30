import { Resend } from 'resend';
import type { Lead } from './types';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');
  return new Resend(key);
}

export async function sendDigestEmail(
  to: string,
  subject: string,
  leads: Lead[]
): Promise<{ success: boolean; error?: string }> {
  const leadsHtml = leads
    .map(
      (l) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #333">${l.username}</td>
        <td style="padding:8px;border-bottom:1px solid #333">${l.source}</td>
        <td style="padding:8px;border-bottom:1px solid #333">${l.lead_type}</td>
        <td style="padding:8px;border-bottom:1px solid #333">${l.total_score.toFixed(1)}</td>
        <td style="padding:8px;border-bottom:1px solid #333">${l.email || '—'}</td>
      </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:sans-serif;background:#0A0A0A;color:#E5E5E5;padding:24px;border-radius:8px">
      <h1 style="color:#E8590C;margin-bottom:8px">Blaze Weekly Digest</h1>
      <p>${leads.length} new leads found this week</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead>
          <tr style="color:#E8590C;text-align:left">
            <th style="padding:8px;border-bottom:2px solid #E8590C">Username</th>
            <th style="padding:8px;border-bottom:2px solid #E8590C">Source</th>
            <th style="padding:8px;border-bottom:2px solid #E8590C">Type</th>
            <th style="padding:8px;border-bottom:2px solid #E8590C">Score</th>
            <th style="padding:8px;border-bottom:2px solid #E8590C">Email</th>
          </tr>
        </thead>
        <tbody>${leadsHtml}</tbody>
      </table>
    </div>
  `;

  try {
    await getResend().emails.send({
      from: 'Blaze <onboarding@resend.dev>',
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
