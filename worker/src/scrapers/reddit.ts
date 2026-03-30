import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';

interface RedditPost {
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

function isRelevant(post: RedditPost): boolean {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  const allKeywords = [
    ...CONFIG.scoring.weddingKeywords,
    ...CONFIG.scoring.parisKeywords,
  ];
  return allKeywords.some((kw) => text.includes(kw.toLowerCase()));
}

export async function scrapeReddit(): Promise<void> {
  console.log('[Reddit] Starting scrape run...');

  const { subreddits, maxPostsPerSubreddit } = CONFIG.reddit;
  let totalLeads = 0;

  for (const subreddit of subreddits) {
    console.log(`[Reddit] Scraping r/${subreddit}...`);

    try {
      const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${maxPostsPerSubreddit}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BlazeWorker/1.0 (lead-research-bot)',
        },
      });

      if (!response.ok) {
        console.warn(`[Reddit] HTTP ${response.status} for r/${subreddit}`);
        continue;
      }

      const data = await response.json();
      const posts: RedditPost[] = data.data.children.map((child: any) => child.data);

      for (const post of posts) {
        if (post.author === '[deleted]' || post.author === 'AutoModerator') continue;
        if (!isRelevant(post)) continue;

        await sql`
          INSERT INTO leads (
            platform, platform_id, username, bio,
            source, source_url, scraped_at
          ) VALUES (
            'reddit',
            ${`reddit_${post.author}_${post.created_utc}`},
            ${post.author},
            ${`[r/${post.subreddit}] ${post.title}\n\n${post.selftext.slice(0, 500)}`},
            ${`r/${post.subreddit}`},
            ${'https://www.reddit.com' + post.permalink},
            NOW()
          )
          ON CONFLICT (platform, platform_id) DO NOTHING
        `;

        totalLeads++;
      }

      console.log(`[Reddit] Found ${posts.filter(isRelevant).length} relevant posts in r/${subreddit}`);
    } catch (err) {
      console.error(`[Reddit] Error scraping r/${subreddit}:`, err);
    }

    // Small delay between subreddits
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[Reddit] Scrape complete. ${totalLeads} new leads saved.`);
}
