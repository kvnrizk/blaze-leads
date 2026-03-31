import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';

interface LeadData {
  id: number;
  username: string;
  bio: string;
  followers: number;
  post_count: number;
  external_url: string | null;
  email: string | null;
  is_private: boolean;
  platform: string;
}

interface ScoreResult {
  weddingScore: number;
  parisScore: number;
  qualityScore: number;
  totalScore: number;
  leadType: string;
}

export function scoreLead(lead: LeadData): ScoreResult {
  const text = (lead.bio || '').toLowerCase();

  // Wedding score (0-50): keyword matches x 5, capped at 50
  let weddingHits = 0;
  for (const kw of CONFIG.scoring.weddingKeywords) {
    if (text.includes(kw.toLowerCase())) {
      weddingHits++;
    }
  }
  const weddingScore = Math.min(weddingHits * 5, 50);

  // Paris score (0-30): location keyword matches x 10, capped at 30
  let parisHits = 0;
  for (const kw of CONFIG.scoring.parisKeywords) {
    if (text.includes(kw.toLowerCase())) {
      parisHits++;
    }
  }
  const parisScore = Math.min(parisHits * 10, 30);

  // Quality score (0-20): profile quality signals
  let qualityScore = 0;

  // Has a bio
  if (lead.bio && lead.bio.length > 20) qualityScore += 4;

  // Has followers (for Instagram)
  if (lead.followers > 100) qualityScore += 2;
  if (lead.followers > 1000) qualityScore += 2;
  if (lead.followers > 10000) qualityScore += 2;

  // Has external URL (website = more professional)
  if (lead.external_url) qualityScore += 3;

  // Has email (easier to contact)
  if (lead.email) qualityScore += 3;

  // Has posts/activity
  if (lead.post_count > 10) qualityScore += 2;

  // Not private (can see content)
  if (!lead.is_private) qualityScore += 2;

  qualityScore = Math.min(qualityScore, 20);

  const totalScore = weddingScore + parisScore + qualityScore;
  const leadType = classifyLead(lead);

  return { weddingScore, parisScore, qualityScore, totalScore, leadType };
}

export function classifyLead(lead: LeadData): string {
  const bio = (lead.bio || '').toLowerCase();

  // Couple / bride / groom
  const coupleKeywords = [
    'bride', 'groom', 'mariée', 'marié', 'engaged', 'fiancé', 'fiancée',
    'future mrs', 'future madame', 'getting married', 'je me marie',
    'our wedding', 'notre mariage', 'mrs to be', 'future mariée',
    'bachelorette', 'evjf',
  ];
  if (coupleKeywords.some((kw) => bio.includes(kw))) return 'couple';

  // Wedding planner / coordinator
  const plannerKeywords = [
    'wedding planner', 'organisatrice', 'event planner', 'coordinat',
    'wedding design', 'décoration mariage', 'wedding stylist',
  ];
  if (plannerKeywords.some((kw) => bio.includes(kw))) return 'planner';

  // Vendor (photographer, florist, venue, etc.)
  const vendorKeywords = [
    'photographer', 'photographe', 'videograph', 'vidéaste',
    'florist', 'fleuriste', 'caterer', 'traiteur', 'dj',
    'venue', 'château', 'domaine', 'officiant', 'makeup',
    'maquill', 'hair', 'coiff', 'cake', 'gâteau',
    'stationery', 'papeterie', 'rental', 'location',
  ];
  if (vendorKeywords.some((kw) => bio.includes(kw))) return 'vendor';

  // Content creator / influencer
  const creatorKeywords = [
    'creator', 'créateur', 'influencer', 'blogger', 'blogueuse',
    'content', 'contenu', 'youtube', 'tiktok',
  ];
  if (creatorKeywords.some((kw) => bio.includes(kw))) return 'creator';

  return 'other';
}

export async function scoreAllUnscored(): Promise<number> {
  console.log('[Scorer] Scoring unscored leads...');

  const leads = await sql`
    SELECT id, username, bio, followers, post_count, external_url,
           email, is_private, platform
    FROM leads
    WHERE scored_at IS NULL
    ORDER BY scraped_at DESC
    LIMIT 200
  `;

  let scored = 0;

  for (const lead of leads) {
    const result = scoreLead(lead as unknown as LeadData);

    await sql`
      UPDATE leads SET
        wedding_score = ${result.weddingScore},
        paris_score = ${result.parisScore},
        quality_score = ${result.qualityScore},
        total_score = ${result.totalScore},
        lead_type = ${result.leadType},
        scored_at = NOW()
      WHERE id = ${lead.id}
    `;

    scored++;
  }

  console.log(`[Scorer] Scored ${scored} leads`);
  return scored;
}
