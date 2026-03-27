export type LeadSource = 'instagram' | 'reddit' | 'directory' | 'facebook' | 'blog';

export type LeadType = 'couple' | 'planner' | 'vendor' | 'creator' | 'other';

export type OutreachChannel = 'instagram_dm' | 'instagram_comment' | 'email';

export type OutreachStatus = 'pending' | 'sent' | 'replied' | 'booked' | 'failed';

export type ScrapeStatus = 'running' | 'completed' | 'failed';

export interface Lead {
  id: number;
  source: LeadSource;
  source_url: string | null;
  username: string;
  full_name: string | null;
  bio: string | null;
  email: string | null;
  followers: number | null;
  posts_count: number | null;
  lead_type: LeadType;
  wedding_score: number;
  paris_score: number;
  quality_score: number;
  total_score: number;
  found_via: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface Outreach {
  id: number;
  lead_id: number;
  channel: OutreachChannel;
  status: OutreachStatus;
  message_draft: string | null;
  message_sent: string | null;
  sent_at: string | null;
  replied_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ScrapeRun {
  id: number;
  source: LeadSource;
  started_at: string;
  finished_at: string | null;
  leads_found: number;
  leads_new: number;
  status: ScrapeStatus;
  error: string | null;
}
