'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Lead } from '@/lib/types';

type SortField = 'total_score' | 'scraped_at' | 'username';
type SortDir = 'asc' | 'desc';

const PLATFORMS = ['all', 'instagram', 'reddit', 'directory', 'facebook', 'blog'] as const;
const LEAD_TYPES = ['all', 'couple', 'planner', 'vendor', 'creator', 'other'] as const;

const platformIcons: Record<string, string> = {
  instagram: '📸', reddit: '🟠', facebook: '📘', directory: '📂', blog: '📝',
};

const typeIcons: Record<string, string> = {
  couple: '💍', planner: '📋', vendor: '🏪', creator: '🎬', other: '👤',
};

function scoreColor(score: number): string {
  if (score >= 50) return 'text-red-400';
  if (score >= 30) return 'text-orange-400';
  if (score >= 15) return 'text-yellow-400';
  return 'text-neutral-500';
}

function outreachBadge(lead: Lead) {
  const badges: string[] = [];
  if (lead.dm_sent_at) badges.push('DM ✅');
  if (lead.commented_at) badges.push('Comment ✅');
  if (lead.email_sent_at) badges.push('Email ✅');
  if (lead.draft_message && !lead.dm_sent_at) badges.push('Draft 📝');
  return badges;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [leadType, setLeadType] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [sortField, setSortField] = useState<SortField>('total_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (platform !== 'all') params.set('source', platform);
    if (leadType !== 'all') params.set('lead_type', leadType);
    if (minScore > 0) params.set('min_score', String(minScore));
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));

    try {
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.count || 0);
    } catch {
      setLeads([]);
    }
    setLoading(false);
  }, [platform, leadType, minScore, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const sorted = [...leads].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    if (sortField === 'total_score') return (a.total_score - b.total_score) * dir;
    if (sortField === 'scraped_at') return (new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime()) * dir;
    return a.username.localeCompare(b.username) * dir;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const sortArrow = (field: SortField) =>
    sortField === field ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#E8590C]">Blaze Dashboard</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {loading ? 'Loading...' : `${total} leads loaded`}
          </p>
        </div>
        <a href="/" className="text-sm text-neutral-500 hover:text-[#E8590C] transition-colors">
          ← Status
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Source</label>
          <select
            value={platform}
            onChange={e => { setPlatform(e.target.value); setPage(0); }}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-300 focus:border-[#E8590C] focus:outline-none"
          >
            {PLATFORMS.map(p => (
              <option key={p} value={p}>
                {p === 'all' ? 'All Sources' : `${platformIcons[p] || ''} ${p}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Type</label>
          <select
            value={leadType}
            onChange={e => { setLeadType(e.target.value); setPage(0); }}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-300 focus:border-[#E8590C] focus:outline-none"
          >
            {LEAD_TYPES.map(t => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Types' : `${typeIcons[t] || ''} ${t}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Min Score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={e => { setMinScore(Number(e.target.value)); setPage(0); }}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-300 w-20 focus:border-[#E8590C] focus:outline-none"
          />
        </div>

        <button
          onClick={() => { setPlatform('all'); setLeadType('all'); setMinScore(0); setPage(0); }}
          className="text-xs text-neutral-600 hover:text-neutral-400 px-3 py-1.5 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-left">
                <th className="px-4 py-3 font-medium">Source</th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-neutral-300"
                  onClick={() => toggleSort('username')}
                >
                  Lead{sortArrow('username')}
                </th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-neutral-300"
                  onClick={() => toggleSort('total_score')}
                >
                  Score{sortArrow('total_score')}
                </th>
                <th className="px-4 py-3 font-medium">W / P / Q</th>
                <th className="px-4 py-3 font-medium">Bio</th>
                <th className="px-4 py-3 font-medium">Outreach</th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-neutral-300"
                  onClick={() => toggleSort('scraped_at')}
                >
                  Found{sortArrow('scraped_at')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-neutral-600">
                    Loading leads...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-neutral-600">
                    No leads found. Adjust filters or wait for the next scrape.
                  </td>
                </tr>
              ) : (
                sorted.map(lead => (
                  <tr
                    key={lead.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span title={lead.platform}>
                        {platformIcons[lead.platform] || '?'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-200">
                        {lead.source_url ? (
                          <a
                            href={lead.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[#E8590C] transition-colors underline decoration-neutral-700 hover:decoration-[#E8590C]"
                          >
                            {lead.platform === 'instagram' ? `@${lead.username}` : lead.username}
                          </a>
                        ) : (
                          lead.platform === 'instagram' ? `@${lead.username}` : lead.username
                        )}
                      </div>
                      {lead.full_name && lead.full_name !== lead.username && (
                        <div className="text-xs text-neutral-600">{lead.full_name}</div>
                      )}
                      {lead.email && (
                        <div className="text-xs text-neutral-600">{lead.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs bg-neutral-800 px-2 py-0.5 rounded-full">
                        {typeIcons[lead.lead_type] || '?'} {lead.lead_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-lg ${scoreColor(lead.total_score)}`}>
                        {Math.round(lead.total_score)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 font-mono">
                      {Math.round(lead.wedding_score)}/{Math.round(lead.paris_score)}/{Math.round(lead.quality_score)}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-neutral-400 truncate" title={lead.bio || ''}>
                        {lead.bio
                          ? lead.bio.replace(/^\[r\/\w+\]\s*/i, '').slice(0, 80) + (lead.bio.length > 80 ? '...' : '')
                          : '—'}
                      </p>
                      {lead.source && (
                        <span className="text-[10px] text-neutral-600">{lead.source}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {outreachBadge(lead).map((badge, i) => (
                          <span key={i} className="text-xs bg-neutral-800/80 px-1.5 py-0.5 rounded">
                            {badge}
                          </span>
                        ))}
                        {outreachBadge(lead).length === 0 && (
                          <span className="text-xs text-neutral-700">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {new Date(lead.scraped_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total >= limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-neutral-600">Page {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={total < limit}
              className="text-sm text-neutral-500 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
