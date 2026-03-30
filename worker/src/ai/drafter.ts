import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface LeadForDraft {
  username: string;
  full_name?: string;
  bio: string;
  lead_type: string;
  total_score: number;
  platform: string;
  source?: string;
}

function detectLanguage(bio: string): 'fr' | 'en' {
  const frenchIndicators = [
    'mariage', 'mariée', 'marié', 'fiançailles', 'organisatrice',
    'photographe', 'vidéaste', 'fleuriste', 'traiteur',
    'je', 'nous', 'notre', 'mon', 'ma', 'les', 'des', 'une',
  ];

  const lower = bio.toLowerCase();
  const frenchHits = frenchIndicators.filter((w) => lower.includes(w)).length;

  return frenchHits >= 2 ? 'fr' : 'en';
}

function getTemplatePrompt(lead: LeadForDraft, lang: 'fr' | 'en'): string {
  const name = lead.full_name || lead.username;

  const templates: Record<string, Record<string, string>> = {
    couple: {
      fr: `Rédige un message Instagram chaleureux et personnalisé pour ${name}, un couple qui prépare son mariage à Paris. Mentionne leur profil: "${lead.bio}". Propose subtilement nos services de vidéo de mariage cinématique à Paris. Le ton doit être chaleureux, pas commercial. Max 300 caractères.`,
      en: `Write a warm, personalized Instagram message for ${name}, a couple planning their wedding in Paris. Reference their profile: "${lead.bio}". Subtly suggest our cinematic wedding video services in Paris. Warm tone, not salesy. Max 300 characters.`,
    },
    planner: {
      fr: `Rédige un message professionnel pour ${name}, un(e) wedding planner. Mentionne leur profil: "${lead.bio}". Propose une collaboration pour offrir des vidéos de mariage cinématiques à leurs clients à Paris. Ton professionnel et collaboratif. Max 300 caractères.`,
      en: `Write a professional message for ${name}, a wedding planner. Reference their profile: "${lead.bio}". Propose a collaboration to offer cinematic wedding videos to their Paris clients. Professional, collaborative tone. Max 300 characters.`,
    },
    vendor: {
      fr: `Rédige un message de networking pour ${name}, un prestataire de mariage. Mentionne leur profil: "${lead.bio}". Propose un partenariat créatif entre nos services vidéo et les leurs à Paris. Ton amical et professionnel. Max 300 caractères.`,
      en: `Write a networking message for ${name}, a wedding vendor. Reference their profile: "${lead.bio}". Suggest a creative partnership between our video services and theirs in Paris. Friendly, professional tone. Max 300 characters.`,
    },
    creator: {
      fr: `Rédige un message de collaboration pour ${name}, un créateur de contenu. Mentionne leur profil: "${lead.bio}". Propose une collaboration créative autour du mariage et de la vidéo cinématique à Paris. Ton décontracté et enthousiaste. Max 300 caractères.`,
      en: `Write a collab message for ${name}, a content creator. Reference their profile: "${lead.bio}". Suggest a creative collaboration around weddings and cinematic video in Paris. Casual, enthusiastic tone. Max 300 characters.`,
    },
    other: {
      fr: `Rédige un message Instagram amical pour ${name} basé sur leur profil: "${lead.bio}". Mentionne notre passion pour la vidéo de mariage cinématique à Paris. Ton naturel et authentique. Max 300 caractères.`,
      en: `Write a friendly Instagram message for ${name} based on their profile: "${lead.bio}". Mention our passion for cinematic wedding video in Paris. Natural, authentic tone. Max 300 characters.`,
    },
  };

  const type = templates[lead.lead_type] ? lead.lead_type : 'other';
  return templates[type][lang];
}

export async function draftMessage(lead: LeadForDraft): Promise<string> {
  const lang = detectLanguage(lead.bio || '');
  const prompt = getTemplatePrompt(lead, lang);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      system: lang === 'fr'
        ? 'Tu es un assistant qui rédige des messages de prospection pour un vidéaste de mariage cinématique basé à Paris. Tes messages sont chaleureux, authentiques et jamais agressifs commercialement. Réponds UNIQUEMENT avec le message, sans guillemets ni explication.'
        : 'You are an assistant that drafts outreach messages for a cinematic wedding videographer based in Paris. Your messages are warm, authentic, and never pushy. Reply ONLY with the message, no quotes or explanation.',
    });

    const text = response.content[0];
    if (text.type === 'text') {
      return text.text.trim();
    }

    return '';
  } catch (err) {
    console.error('[Drafter] Error drafting message:', err);
    return '';
  }
}

export async function draftAllUndrafted(): Promise<number> {
  // Import sql here to avoid circular deps at module level
  const { sql } = await import('../lib/db.js');

  console.log('[Drafter] Drafting messages for top leads...');

  const leads = await sql`
    SELECT id, username, full_name, bio, lead_type, total_score, platform, source
    FROM leads
    WHERE total_score >= 30
      AND draft_message IS NULL
      AND lead_type IS NOT NULL
    ORDER BY total_score DESC
    LIMIT 20
  `;

  let drafted = 0;

  for (const lead of leads) {
    const message = await draftMessage(lead as unknown as LeadForDraft);
    if (message) {
      await sql`
        UPDATE leads SET
          draft_message = ${message},
          drafted_at = NOW()
        WHERE id = ${lead.id}
      `;
      drafted++;
      console.log(`[Drafter] Drafted message for @${lead.username} (score: ${lead.total_score})`);
    }

    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[Drafter] Drafted ${drafted} messages`);
  return drafted;
}
