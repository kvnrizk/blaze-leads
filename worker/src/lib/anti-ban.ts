const COMMENT_POOL = [
  // French wedding comments
  'Magnifique ! Tellement inspirant pour un mariage 💕',
  'Wow, c\'est absolument sublime ! Félicitations 🥂',
  'Quelle beauté ! Paris est magique pour un mariage ✨',
  'Trop beau ! Vous êtes un couple magnifique 💍',
  'J\'adore cette ambiance ! Quel lieu incroyable 🏰',
  'Superbe ! Ça donne tellement envie de se marier à Paris 🇫🇷',
  'Félicitations aux mariés ! C\'est magnifique 🎉',
  'Quelle belle célébration d\'amour ! Bravo 💒',
  'C\'est tellement romantique ! J\'adore tout 🌹',
  'Un mariage de rêve ! Toutes mes félicitations 💐',
  // English wedding comments
  'Absolutely stunning! What a beautiful celebration 💕',
  'This is gorgeous! Paris weddings are something else ✨',
  'Wow, congratulations! Everything looks amazing 🥂',
  'So beautiful! Love every detail of this 💍',
  'Dream wedding vibes! Congratulations to the happy couple 🎉',
  'This is breathtaking! What a magical venue 🏰',
  'Love this so much! Paris is the perfect backdrop 🇫🇷',
  'Incredible! Every detail is just perfect 💐',
  'Such a beautiful love story! Wishing you all the best 🌹',
  'Goals! This is absolutely dreamy 💒',
  'What an amazing day! Congratulations 🍾',
  'So inspiring! Love the elegance of this celebration ✨',
];

/**
 * Returns a random delay with a gaussian-like distribution between min and max.
 * Uses Box-Muller transform for more human-like timing.
 */
export async function humanDelay(min: number, max: number): Promise<void> {
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  // Map gaussian (-3..3) to (0..1) range, clamped
  const normalized = Math.max(0, Math.min(1, (gaussian + 3) / 6));
  const delay = min + normalized * (max - min);

  return new Promise((resolve) => setTimeout(resolve, Math.round(delay)));
}

/**
 * Returns a random comment from the pool.
 */
export function randomComment(): string {
  const index = Math.floor(Math.random() * COMMENT_POOL.length);
  return COMMENT_POOL[index];
}

/**
 * Returns true on weekends to signal 50% activity reduction.
 */
export function shouldReduceActivity(): boolean {
  const now = new Date();
  const day = now.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}
