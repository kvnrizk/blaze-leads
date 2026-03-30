# Blaze Lead Gen — Automated Wedding Lead Machine for Sam

> **Date:** 2026-03-27
> **Owner:** Kevin (build) → Sam (operate)
> **Status:** Approved design, pending implementation
> **Project:** Standalone (NOT part of Noriz)

---

## 1. What Is This

A fully automated lead generation and outreach system for Blaze Production (Paris wedding videography). Sam receives leads via Telegram daily + email digest weekly. The system scrapes, scores, drafts messages, auto-comments, auto-DMs, and auto-emails — all hands-off.

### User: Sam
- **Technical level:** Zero. He receives Telegram messages and copy-pastes or approves. Never touches code.
- **Existing assets:** Blaze Production Instagram account + business email
- **Budget:** Free tier only ($0/month target). WhatsApp added later when budget allows.

### What Sam Gets
- **Daily Telegram alert** at ~10:30am Paris time with new leads, scores, and outreach summary
- **Bot commands** (`/leads`, `/top`, `/scrape`, `/stats`, `/pause`, `/resume`, `/status`)
- **Weekly email digest** (Monday 8am) with PDF report + CSV attached
- **Auto-outreach running in background** — comments, DMs, emails sent on his behalf

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                  SAM (end user)                  │
│              Telegram  ·  Email                  │
│           (WhatsApp added later)                 │
└──────────┬──────────────┬───────────────────────┘
           │              │
    ┌──────▼──────┐  ┌────▼─────┐
    │  Telegram    │  │  Resend  │
    │  Bot API     │  │  (email) │
    │  (free)      │  │  (free)  │
    └──────┬──────┘  └────┬─────┘
           │              │
┌──────────▼──────────────▼───────────────────────┐
│          VERCEL (Next.js App Router)             │
│                                                   │
│  /api/telegram   ← webhook for bot commands       │
│  /api/leads      ← CRUD + filtering               │
│  /api/digest     ← triggered by cron, sends email  │
│  /api/health     ← health check endpoint           │
│  /dashboard      ← optional web UI for leads       │
│                                                   │
│  Cron: weekly digest (vercel.json)                │
└──────────────────┬──────────────────────────────┘
                   │
            ┌──────▼──────┐
            │ Neon Postgres │  (free tier)
            │  - leads       │
            │  - outreach    │
            │  - scrape_runs │
            │  - rate_limits │
            └──────┬──────┘
                   │
┌──────────────────▼──────────────────────────────┐
│          RAILWAY (Worker Service)                 │
│                                                   │
│  Scrapers (daily, staggered 6am-9am Paris):       │
│    ├── Instagram (Playwright + session cookies)   │
│    ├── Reddit (JSON API, no auth)                 │
│    ├── Wedding directories (Playwright)           │
│    ├── Facebook groups (Playwright)               │
│    └── Blog comment sections (HTTP)               │
│                                                   │
│  Automation (9am-10:30am):                        │
│    ├── AI scoring + message drafting (Claude)     │
│    ├── Auto-commenter (Instagram, 30-120s delays) │
│    ├── Auto-DM sender (Instagram, 2-5min delays)  │
│    └── Auto-email (Resend, max 20/day)            │
│                                                   │
│  Delivery (10:30am):                              │
│    └── Telegram daily report to Sam               │
│                                                   │
│  Sleep mode: runs 6am-11am only (150h/month)      │
│  Scheduler: node-cron                             │
└─────────────────────────────────────────────────┘
```

**Two services, one database:**
- **Vercel** = delivery layer (Telegram webhook, email digest, optional dashboard)
- **Railway** = engine (scraping, automation, AI drafting)
- **Neon Postgres** = shared state (leads, outreach tracking, rate limits)

---

## 3. Data Model

### leads
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| source | enum | instagram, reddit, directory, facebook, blog |
| source_url | text | Profile URL, thread URL, listing URL |
| username | text | Instagram handle or platform username |
| full_name | text | |
| bio | text | |
| email | text, nullable | Scraped from bio/website |
| followers | int | |
| posts_count | int | |
| lead_type | enum | couple, planner, vendor, creator, other |
| wedding_score | int | 0-50, keyword matches |
| paris_score | int | 0-30, location signals |
| quality_score | int | 0-20, profile quality |
| total_score | int | Sum of above |
| found_via | text | Hashtag, subreddit, directory name |
| scraped_at | timestamp | |
| raw_data | jsonb | Full scraped payload |
| | UNIQUE | (source, username) |

### outreach
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| lead_id | FK → leads | |
| channel | enum | instagram_dm, instagram_comment, email |
| status | enum | pending, sent, replied, booked, failed |
| message_draft | text | AI-generated |
| message_sent | text | What was actually sent |
| sent_at | timestamp, nullable | |
| replied_at | timestamp, nullable | |
| error | text, nullable | Failure reason |
| created_at | timestamp | |

### scrape_runs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| source | enum | |
| started_at | timestamp | |
| finished_at | timestamp, nullable | |
| leads_found | int | |
| leads_new | int | Excluding duplicates |
| status | enum | running, completed, failed |
| error | text, nullable | |

### rate_limits
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| platform | enum | instagram, reddit, email |
| action | enum | scrape, comment, dm, email |
| daily_count | int | |
| daily_limit | int | |
| last_action_at | timestamp | |
| reset_date | date | |

---

## 4. Scraper Engine (Railway Worker)

### Daily Schedule (Paris Time, staggered)

| Time | Source | Method | Limits |
|------|--------|--------|--------|
| 06:00 | Instagram hashtags | Playwright + login session | 10 hashtags, 30 posts each, 3-5s delays |
| 06:45 | Instagram profile enrichment | Playwright | 50 profiles/run, 5-10s delays |
| 07:15 | Reddit | Reddit JSON API (append .json to URLs) | 3 subreddits, 100 posts each |
| 07:30 | Wedding directories | Playwright | Mariages.net, WeddingWire, Junebug, OuiLove, Carats+Cake |
| 08:00 | Facebook groups | Playwright + login session | 4 groups, 20 posts each, 10-15s delays |
| 08:30 | Blog comments | HTTP/cheerio | 6 blogs (La Soeur de la Mariee, Le Blog de Madame C, etc.) |
| 09:00 | Scoring + AI drafting | Claude API | Score all new leads, draft personalized messages |
| 09:30 | Auto-comment | Playwright Instagram | Top 10 high-score posts, 30-120s random delays |
| 10:00 | Auto-DM | Playwright Instagram | Top 5 couples only, 2-5min delays between DMs |
| 10:15 | Auto-email | Resend API | Planners/vendors with public email, max 20/day |
| 10:30 | Notify Sam | Telegram Bot API | Daily summary + top leads |

### Lead Sources Detail

**Instagram (10 hashtags):**
- mariageparis, weddingparis, fiancailles, futuremariee, evjfparis
- mariagefrance, demandemariage, listemariage, weddinginfrance, parisproposal

**Reddit (3 subreddits):**
- r/BigBudgetBrides — luxury couples asking for Paris vendor recs
- r/weddingplanning — filter for Paris/France threads
- r/ProposalParis — pre-engagement couples scouting locations

**Wedding Directories (5 sites):**
- Mariages.net (Ile-de-France section)
- WeddingWire France (Paris vendors)
- Junebug Weddings (France/Paris)
- OuiLove Paris (directory)
- Carats + Cake (Europe/France)

**Facebook Groups (4 groups):**
- Couples Retreat Group (Say I Do in France)
- Mariages.net Communaute
- Expat groups (AWG Paris, InterNations)
- Wedding Planning Facebook Groups (via VintageBash list)

**Blogs (6 sites, comment sections):**
- lasoeurdelamariee.com, leblogdemadamec.fr, lamarieeencolere.com
- lamarieeauxpiedsnus.com, preparetonmariage.fr, danielle-moss.com

### Lead Scoring (same algorithm as existing script, enhanced)

```
wedding_score (0-50):  keyword matches × 5 (capped)
paris_score   (0-30):  location keyword matches × 10 (capped)
quality_score (0-20):
  +5 if public profile
  +5 if 500-50K followers (sweet spot)
  +5 if 10+ posts
  +5 if normal follower/following ratio (0.3-5.0)
total_score = wedding + paris + quality
```

### Lead Classification
- **couple** — bio contains fiancé/bride/mariée/she said yes/je dis oui/mrs
- **planner** — bio contains wedding planner/organisat/coordinat/event
- **creator/vendor** — bio contains vidéo/photo/drone/production (2+ hits)
- **other** — doesn't match above

### AI Message Drafting (Claude)
- Input: lead profile (bio, type, score, source, language detected)
- Output: personalized message in French (default) or English (if bio is English)
- 4 base templates by lead_type, AI personalizes based on bio content
- Messages stored in `outreach.message_draft`

---

## 5. Instagram Anti-Ban Strategy

This is critical. Instagram aggressively blocks automation.

**Rate limits (conservative start):**
- Max 5 DMs/day
- Max 10 comments/day
- Max 50 profile views/day
- Max 300 total actions/day (including scrolling, viewing)
- Weekend mode: reduce all by 50%

**Human-like behavior:**
- Random delays between all actions (not fixed intervals)
- Gaussian distribution for delays (most actions 3-5s, occasional 15-30s pauses)
- Simulate scrolling and browsing before taking action on a profile
- Vary comment text (pool of 20+ comment templates, randomized)
- Session cookies saved/reused (no fresh login every run)

**If rate-limited or challenged:**
- Pause all Instagram automation for 24h automatically
- Alert Kevin via Telegram immediately
- Log the incident in scrape_runs with error details
- Gradually ramp back up (50% → 75% → 100% over 3 days)

**Comment pool (20+ variations):**
- "Magnifique! 🔥", "Trop beau 😍", "J'adore le style!", "Superbe 🎬"
- "Félicitations! 🎉", "Quel beau couple!", "Paris dream wedding ✨"
- etc. — rotated randomly, never the same comment twice on same profile

---

## 6. Delivery to Sam

### Telegram Bot

**Daily report (10:30am Paris):**
```
🔥 Blaze Daily Lead Report — Mar 28, 2026

📊 Today's Scrape:
  • 23 new leads found
  • 8 couples | 5 planners | 6 vendors | 4 other
  • 3 high-score (30+)

🏆 Top Lead:
  @marie_et_julien (Score: 42, Couple)
  "Future Mme J 💍 Mariage Paris Sept 2026"
  → DM sent ✅

📨 Outreach Summary:
  • 5 DMs sent
  • 10 comments posted
  • 8 emails sent to planners

/leads — full list  |  /top — best leads
/stats — weekly stats  |  /scrape — run now
```

**Bot commands:**
| Command | Action |
|---------|--------|
| /leads | List today's leads with scores |
| /top | High-score leads only (30+) |
| /scrape | Trigger immediate scrape run |
| /stats | Weekly/monthly stats |
| /pause | Pause all automation |
| /resume | Resume automation |
| /status | System health (last scrape, DB size, rate limit status) |

### Weekly Email Digest (Monday 8am)
- Sent via Resend to Sam's email
- PDF report attached (same format as existing Blaze report)
- CSV attached with all leads from the week
- Summary stats: leads found, outreach sent, replies received, conversion rate

---

## 7. Project Structure

### Vercel App (`blaze-leads/`)
```
blaze-leads/
├── app/
│   ├── page.tsx                ← Status page ("System running")
│   ├── dashboard/
│   │   └── page.tsx            ← Lead list table (optional browse)
│   ├── api/
│   │   ├── telegram/route.ts   ← Telegram webhook handler
│   │   ├── leads/route.ts      ← GET leads with filters
│   │   ├── digest/route.ts     ← Cron-triggered weekly email
│   │   └── health/route.ts     ← Health check for Railway
├── lib/
│   ├── db.ts                   ← Neon Postgres (drizzle or raw sql)
│   ├── telegram.ts             ← Telegram Bot API helpers
│   ├── email.ts                ← Resend + PDF generation
│   └── types.ts                ← Shared types
├── vercel.json                 ← Cron: "0 8 * * 1" (Monday 8am)
└── package.json
```

### Railway Worker (`blaze-worker/`)
```
blaze-worker/
├── src/
│   ├── index.ts                ← Entry point, scheduler setup
│   ├── scheduler.ts            ← node-cron daily jobs
│   ├── scrapers/
│   │   ├── instagram.ts        ← Playwright Instagram scraper
│   │   ├── reddit.ts           ← Reddit JSON API scraper
│   │   ├── directories.ts      ← Wedding directory scraper
│   │   ├── facebook.ts         ← Playwright Facebook group scraper
│   │   └── blogs.ts            ← Blog comment scraper
│   ├── automation/
│   │   ├── commenter.ts        ← Instagram auto-commenter
│   │   ├── dm-sender.ts        ← Instagram auto-DM
│   │   └── emailer.ts          ← Auto-email via Resend
│   ├── ai/
│   │   ├── scorer.ts           ← Lead scoring logic
│   │   └── drafter.ts          ← Claude message drafting
│   ├── delivery/
│   │   └── telegram.ts         ← Send daily report to Sam
│   ├── lib/
│   │   ├── db.ts               ← Neon Postgres connection
│   │   ├── rate-limiter.ts     ← Per-platform rate limiting
│   │   └── anti-ban.ts         ← Human-like delay patterns
│   └── config.ts               ← Settings (limits, delays, hashtags, targets)
├── package.json
└── Dockerfile
```

---

## 8. Free Tier Constraints

| Service | Free Tier Limit | Our Usage | Fits? |
|---------|----------------|-----------|-------|
| Vercel | 100GB bandwidth, 1 cron | Telegram webhook + weekly cron | Yes |
| Neon Postgres | 0.5GB, 190h compute/month | ~1000 leads/month | Yes |
| Railway | 500h/month ($5 credit) | Sleep mode: 5h/day = 150h/month | Yes |
| Resend | 100 emails/day, 3000/month | ~20 emails/day | Yes |
| Telegram Bot API | Unlimited, free | Daily alerts + commands | Yes |
| Claude API | Kevin's existing key | ~50 calls/day | Yes (Kevin's cost) |

**Railway sleep mode:** Worker runs 6am-11am Paris time only (5h/day × 30 = 150h/month). Woken by Vercel cron or manual `/scrape` command. Saves 570h/month vs always-on.

---

## 9. Agile Implementation Plan (6 Sprints)

### Sprint 1: Foundation (Days 1-3)
- [ ] Create `blaze-leads/` Next.js project, deploy to Vercel
- [ ] Create `blaze-worker/` Node.js project, deploy to Railway
- [ ] Set up Neon Postgres, create schema (leads, outreach, scrape_runs, rate_limits)
- [ ] Set up Telegram Bot via BotFather, get token
- [ ] Environment variables on both Vercel and Railway
- **Deliverable:** Both services running, DB connected, Telegram bot responds to `/status`

### Sprint 2: Scrapers (Days 4-8)
- [ ] Instagram hashtag scraper (Playwright)
- [ ] Instagram profile enricher (Playwright)
- [ ] Reddit scraper (JSON API)
- [ ] Wedding directory scrapers (Playwright — Mariages.net, WeddingWire, Junebug, OuiLove, Carats+Cake)
- [ ] Facebook group scraper (Playwright)
- [ ] Blog comment scraper (HTTP/cheerio)
- [ ] Lead scoring engine
- [ ] Dedup logic (UNIQUE constraint + upsert)
- [ ] Scrape run tracking (scrape_runs table)
- **Deliverable:** All 5 sources scraping daily, leads stored in DB with scores

### Sprint 3: AI + Outreach Engine (Days 9-12)
- [ ] Claude message drafter (4 templates by lead type, personalized)
- [ ] Auto-commenter (Instagram, 20+ comment pool, human delays)
- [ ] Auto-DM sender (Instagram, rate-limited, 5/day max)
- [ ] Auto-emailer (Resend, planners/vendors with public email)
- [ ] Rate limiter (per-platform daily tracking)
- [ ] Anti-ban module (random delays, pause on challenge, alert Kevin)
- **Deliverable:** Full automation pipeline: scrape → score → draft → send

### Sprint 4: Delivery to Sam (Days 13-15)
- [ ] Telegram daily report (10:30am summary)
- [ ] Bot commands (/leads, /top, /scrape, /stats, /pause, /resume, /status)
- [ ] Weekly email digest (Monday 8am, PDF + CSV)
- [ ] PDF report generator (reuse existing reportlab format)
- **Deliverable:** Sam receives leads via Telegram + weekly email

### Sprint 5: Scheduling + Sleep Mode (Days 16-17)
- [ ] node-cron scheduler on Railway (staggered daily jobs)
- [ ] Sleep mode (Railway sleeps outside 6am-11am Paris)
- [ ] Vercel cron to wake Railway worker
- [ ] Manual `/scrape` triggers wake + immediate run
- **Deliverable:** Fully automated daily cycle running hands-off

### Sprint 6: Hardening + Dashboard (Days 18-20)
- [ ] Error handling and retry logic across all scrapers
- [ ] Monitoring: alert Kevin on Telegram if scraper fails
- [ ] Optional dashboard page (lead list with filters)
- [ ] Stats tracking (leads/week, DMs sent, replies, conversion)
- [ ] Documentation for Sam (what to expect, how to use bot)
- **Deliverable:** Production-ready system, handed to Sam

---

## 10. Future Additions (Post-Launch)

- **WhatsApp delivery** — WhatsApp Business API when Sam has budget (~$15/month)
- **Proxy rotation** — residential proxies for Instagram if ban rate increases
- **Lead CRM** — web dashboard with kanban (Lead → Contacted → Meeting → Booked)
- **Reply detection** — monitor Instagram DM replies and update outreach status
- **Smart scheduling** — AI decides best time to DM based on lead activity patterns
- **Multi-city expansion** — add Lyon, Marseille, Nice wedding markets
- **Referral tracking** — track which leads actually book Blaze (manual input by Sam)

---

## 11. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Instagram bans Sam's account | HIGH | Conservative rate limits, human delays, pause on challenge |
| Facebook blocks scraping | MEDIUM | Facebook is hardest to scrape — deprioritize if blocked |
| Railway free tier runs out | LOW | Sleep mode keeps us at 150h/month (limit: 500h) |
| Resend free tier limit | LOW | 20 emails/day is well under 100/day limit |
| Claude API costs spike | LOW | ~50 calls/day × ~$0.01 = ~$15/month max |
| Leads are low quality | MEDIUM | Tune scoring algorithm based on first 2 weeks of data |

---

## 12. Credentials Needed

| Credential | Where | Who Sets Up |
|------------|-------|-------------|
| TELEGRAM_BOT_TOKEN | BotFather | Kevin |
| TELEGRAM_CHAT_ID | Sam's Telegram user ID | Kevin (get from Sam) |
| INSTAGRAM_USERNAME | Blaze Production account | Sam provides |
| INSTAGRAM_PASSWORD | Blaze Production account | Sam provides |
| FACEBOOK_EMAIL | Blaze/Sam's Facebook | Sam provides |
| FACEBOOK_PASSWORD | Blaze/Sam's Facebook | Sam provides |
| DATABASE_URL | Neon Postgres | Auto-provisioned |
| RESEND_API_KEY | Resend dashboard | Kevin |
| ANTHROPIC_API_KEY | Claude API | Kevin (existing key) |
| SAM_EMAIL | Sam's email for digest | Sam provides |
