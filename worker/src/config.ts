export const CONFIG = {
  instagram: {
    hashtags: [
      'mariageparis',
      'weddingparis',
      'fiancailles',
      'futuremariee',
      'evjfparis',
      'mariagefrance',
      'demandemariage',
      'listemariage',
      'weddinginfrance',
      'parisproposal',
    ],
    maxPostsPerHashtag: 30,
    maxProfilesPerRun: 50,
    maxDmsPerDay: 5,
    maxCommentsPerDay: 10,
  },

  reddit: {
    subreddits: ['BigBudgetBrides', 'weddingplanning', 'ProposalParis'],
    maxPostsPerSubreddit: 100,
  },

  directories: [
    'mariages.net',
    'weddingwire',
    'junebug',
    'ouilove',
    'caratsandcake',
  ],

  facebook: {
    groups: [
      'https://www.facebook.com/groups/parisexpats',
      'https://www.facebook.com/groups/parisbrides',
      'https://www.facebook.com/groups/weddingplanningparis',
      'https://www.facebook.com/groups/destinationweddingsfrance',
    ],
  },

  blogs: [
    'https://www.lasoeurdelamariee.com/',
    'https://www.leblogdemadamec.fr/',
    'https://www.lamarieeencolere.com/',
    'https://www.lamarieeauxpiedsnus.com/',
    'https://www.preparetonmariage.fr/',
    'https://danielle-moss.com/',
  ],

  scoring: {
    weddingKeywords: [
      'wedding', 'mariage', 'bride', 'mariée', 'groom', 'marié',
      'engaged', 'fiancée', 'fiancé', 'proposal', 'demande en mariage',
      'engagement', 'fiançailles', 'nuptial', 'ceremony', 'cérémonie',
      'reception', 'réception', 'bridal', 'nuptiale', 'vows', 'voeux',
      'honeymoon', 'lune de miel', 'elopement', 'élopement',
      'bridesmaids', 'demoiselles d\'honneur', 'groomsmen', 'témoins',
      'wedding planner', 'organisatrice', 'traiteur', 'caterer',
      'florist', 'fleuriste', 'photographer', 'photographe',
      'videographer', 'vidéaste', 'DJ', 'officiant',
      'save the date', 'RSVP', 'registry', 'liste de mariage',
      'bachelorette', 'EVJF', 'bachelor party', 'EVG',
      'wedding dress', 'robe de mariée', 'tuxedo', 'costume',
      'venue', 'lieu de réception', 'château', 'domaine',
    ],
    parisKeywords: [
      'paris', 'parisien', 'parisienne', 'île-de-france', 'ile de france',
      'france', 'french', 'français', 'française',
      'eiffel', 'montmartre', 'versailles', 'louvre',
      'champs-élysées', 'seine', 'marais', 'saint-germain',
      'trocadéro', 'invalides', 'palais royal', 'tuileries',
      'vincennes', 'boulogne', 'neuilly', 'levallois',
      'destination wedding france', 'mariage à paris',
    ],
    productionKeywords: [
      'video', 'vidéo', 'film', 'cinematic', 'cinématique',
      'cinematography', 'cinématographie', 'filmmaker', 'réalisateur',
      'videographer', 'vidéaste', 'drone', 'aerial',
      'highlight', 'teaser', 'trailer', 'bande-annonce',
      'same day edit', 'SDE', 'love story', 'histoire d\'amour',
      'behind the scenes', 'BTS', 'raw footage', 'rushes',
      'color grading', 'étalonnage', 'editing', 'montage',
      'production', 'post-production', 'shooting', 'tournage',
      'camera', 'caméra', 'lens', 'objectif',
      'lighting', 'éclairage', 'audio', 'sound',
      'content creator', 'créateur de contenu', 'influencer',
    ],
  },

  delays: {
    instagram: { min: 3000, max: 5000 },
    instagramComment: { min: 30000, max: 120000 },
    instagramDm: { min: 120000, max: 300000 },
    facebook: { min: 10000, max: 15000 },
  },

  email: {
    maxPerDay: 20,
  },

  schedule: {
    timezone: 'Europe/Paris',
    scraperCron: '0 6 * * *',
  },
} as const;
