import * as cheerio from 'cheerio';
import { CONFIG } from '../config.js';
import { sql } from '../lib/db.js';

interface BlogComment {
  commenterName: string;
  commentText: string;
  postUrl: string;
  blogDomain: string;
  relevanceScore: number;
}

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of CONFIG.scoring.weddingKeywords) {
    if (lower.includes(kw.toLowerCase())) score += 3;
  }
  for (const kw of CONFIG.scoring.parisKeywords) {
    if (lower.includes(kw.toLowerCase())) score += 5;
  }

  return Math.min(score, 100);
}

async function scrapeBlog(blogUrl: string): Promise<BlogComment[]> {
  const domain = new URL(blogUrl).hostname.replace('www.', '');
  console.log(`[Blogs] Scraping ${domain}...`);
  const comments: BlogComment[] = [];

  try {
    // Fetch the main blog page to find recent post URLs
    const response = await fetch(blogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.warn(`[Blogs] HTTP ${response.status} for ${domain}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find blog post links (common patterns)
    const postLinks: string[] = [];
    $('a[href*="/blog/"], a[href*="/post/"], article a[href], .post-title a, h2 a, h3 a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !postLinks.includes(href)) {
        const fullUrl = href.startsWith('http') ? href : new URL(href, blogUrl).toString();
        postLinks.push(fullUrl);
      }
    });

    // Scrape comments from the first 5 posts
    const postsToScrape = postLinks.slice(0, 5);

    for (const postUrl of postsToScrape) {
      try {
        const postResponse = await fetch(postUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!postResponse.ok) continue;

        const postHtml = await postResponse.text();
        const post$ = cheerio.load(postHtml);

        // Extract comments (common selectors for WordPress, Disqus, etc.)
        post$('.comment, .comment-body, [id*="comment"], .dsq-comment-body').each((_, commentEl) => {
          const authorEl = post$(commentEl).find('.comment-author, .author, .fn, .dsq-comment-header a').first();
          const textEl = post$(commentEl).find('.comment-content, .comment-text, p').first();

          const commenterName = authorEl.text().trim();
          const commentText = textEl.text().trim();

          if (commenterName && commentText && commentText.length > 10) {
            const relevanceScore = scoreRelevance(commentText);
            if (relevanceScore > 0) {
              comments.push({
                commenterName,
                commentText: commentText.slice(0, 500),
                postUrl,
                blogDomain: domain,
                relevanceScore,
              });
            }
          }
        });

        // Small delay between posts
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.warn(`[Blogs] Error scraping post ${postUrl}:`, err);
      }
    }

    console.log(`[Blogs] Found ${comments.length} relevant comments on ${domain}`);
  } catch (err) {
    console.error(`[Blogs] Error scraping ${domain}:`, err);
  }

  return comments;
}

export async function scrapeBlogs(): Promise<void> {
  console.log('[Blogs] Starting blog comment scrape...');

  const allComments: BlogComment[] = [];

  for (const blogUrl of CONFIG.blogs) {
    const comments = await scrapeBlog(blogUrl);
    allComments.push(...comments);
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Save leads to DB
  for (const comment of allComments) {
    await sql`
      INSERT INTO leads (
        platform, platform_id, username, bio,
        source, source_url, scraped_at
      ) VALUES (
        'blog',
        ${`blog_${comment.blogDomain}_${comment.commenterName}_${Date.now()}`},
        ${comment.commenterName},
        ${comment.commentText},
        ${comment.blogDomain},
        ${comment.postUrl},
        NOW()
      )
      ON CONFLICT (platform, platform_id) DO NOTHING
    `;
  }

  console.log(`[Blogs] Scrape complete. ${allComments.length} leads saved.`);
}
