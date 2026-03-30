export type LeadPlatform = 'instagram' | 'reddit' | 'directory' | 'facebook' | 'blog';
export type LeadType = 'couple' | 'planner' | 'vendor' | 'creator' | 'other';
export type OutreachChannel = 'instagram_dm' | 'instagram_comment' | 'email';
export type OutreachStatus = 'pending' | 'sent' | 'replied' | 'booked' | 'failed';
export type ScrapeStatus = 'running' | 'completed' | 'failed';

export interface Lead {
  id: number;
  platform: LeadPlatform;
  platform_id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  email: string | null;
  followers: number;
  post_count: number;
  external_url: string | null;
  is_private: boolean;
  source: string | null;
  source_url: string | null;
  lead_type: LeadType;
  wedding_score: number;
  paris_score: number;
  quality_score: number;
  total_score: number;
  scored_at: string | null;
  draft_message: string | null;
  drafted_at: string | null;
  commented_at: string | null;
  dm_sent_at: string | null;
  email_sent_at: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface Outreach {
  id: number;
  lead_id: number;
  channel: OutreachChannel;
  status: OutreachStatus;
  message: string | null;
  sent_at: string | null;
  replied_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ScrapeRun {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  leads_found: number;
  leads_new: number;
  status: ScrapeStatus;
  error: string | null;
}
