'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/AdminCollaborationsPage.tsx
// Admin management screen for Collaborations & Partnerships
// ════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase';
import MarkdownEditorWithImages from '@/components/admin/MarkdownEditorWithImages';
import type { User } from '@/types/database';
import type { CollaborationsPageData } from '@/types/collaborations';

interface Props {
  user: User;
  onNavigate?: (page: string) => void;
}

const DEFAULT_COLLABORATION_CONTENT = `<h2>Empowering Developers Together</h2>
<p>BitByBit collaborates with top collegiate developer clubs, technical organizations, and industry partners to host competitive programming arenas, hackathons, and structured learning cohorts.</p>

<h3>Why Partner With BitByBit?</h3>
<ul>
  <li><strong>High Engagement:</strong> Direct access to an active community of skilled problem solvers and engineers.</li>
  <li><strong>Custom Arena Competitions:</strong> Turnkey proctored coding assessments tailored to your college or organization.</li>
  <li><strong>Verified Credentials:</strong> Issue cryptographically verifiable certificates with activity points recognition.</li>
</ul>

<p>Interested in organizing an event or partnering with BitByBit? Contact our team at <a href="mailto:teamcodelocked@gmail.com">teamcodelocked@gmail.com</a>.</p>`;

export default function AdminCollaborationsPage({ user, onNavigate }: Props) {
  const [title, setTitle] = useState<string>('Our Collaborations & Partnerships');
  const [content, setContent] = useState<string>('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch current data on mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setMessage(null);
      try {
        const supabase = getSupabaseClient();
        // eslint-disable-next-line
        const { data, error } = await (supabase.from('collaborations_page') as any)
          .select('id, title, content, updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          if (isMounted) {
            setRecordId(data.id || null);
            setTitle(data.title || 'Our Collaborations & Partnerships');
            setContent(data.content || DEFAULT_COLLABORATION_CONTENT);
            setLastSavedAt(data.updated_at || null);
          }
        } else {
          // Fallback fetch from API route
          const res = await fetch('/api/collaborations');
          const json = await res.json();
          if (isMounted) {
            const rowData: CollaborationsPageData = json.data;
            if (rowData) {
              setRecordId(rowData.id || null);
              setTitle(rowData.title || 'Our Collaborations & Partnerships');
              setContent(rowData.content || DEFAULT_COLLABORATION_CONTENT);
              setLastSavedAt(rowData.updated_at || null);
            }
          }
        }
      } catch (err: any) {
        console.warn('Could not load existing collaborations content:', err);
        if (isMounted) {
          setTitle('Our Collaborations & Partnerships');
          setContent(DEFAULT_COLLABORATION_CONTENT);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Save changes to Supabase and API
   */
  async function handleSave() {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Page title cannot be empty.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Method 1: Save via dedicated API route with Admin Auth
      const res = await fetch('/api/collaborations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        // Method 2: Direct Supabase client fallback if session is valid
        // eslint-disable-next-line
        const clientQuery = recordId
          ? (supabase.from('collaborations_page') as any)
              .update({
                title: title.trim(),
                content: content.trim(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', recordId)
          : (supabase.from('collaborations_page') as any).insert({
              title: title.trim(),
              content: content.trim(),
              updated_at: new Date().toISOString(),
            });

        const { data: directData, error: directErr } = await clientQuery.select().single();
        if (directErr) {
          throw new Error(result.error || directErr.message || 'Failed to save changes');
        }

        if (directData?.id) setRecordId(directData.id);
      } else if (result.data?.id) {
        setRecordId(result.data.id);
      }

      setLastSavedAt(new Date().toISOString());
      setMessage({
        type: 'success',
        text: '✓ Collaborations page updated and published successfully!',
      });

      // Clear success message after 5 seconds
      setTimeout(() => {
        setMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error('Save error:', err);
      setMessage({
        type: 'error',
        text: `Failed to save: ${err.message || 'Unknown error occurred'}`,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleResetTemplate() {
    if (window.confirm('Reset content to the standard default partnership template?')) {
      setTitle('Our Collaborations & Partnerships');
      setContent(DEFAULT_COLLABORATION_CONTENT);
      setMessage({
        type: 'success',
        text: 'Template reset. Click "Save Changes" to publish.',
      });
    }
  }

  if (!user?.is_admin) {
    return (
      <div className="py-24 text-center font-mono text-sm text-[var(--muted)]">
        Access denied. Administrator privileges required.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-24 space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-zinc-500 mb-1">
            {onNavigate ? (
              <button
                onClick={() => onNavigate('admin')}
                className="hover:text-slate-800 dark:hover:text-zinc-300 transition-colors"
              >
                Admin Panel
              </button>
            ) : (
              <Link href="/admin" className="hover:text-slate-800 dark:hover:text-zinc-300 transition-colors">
                Admin Panel
              </Link>
            )}
            <span>/</span>
            <span className="text-slate-700 dark:text-zinc-300">Collaborations &amp; Partnerships</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-zinc-100 flex items-center gap-2.5">
            <span>🤝</span>
            <span>Collaborations Page Manager</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 font-sans mt-1">
            Customize the public <code className="text-cyan-600 dark:text-cyan-300 font-mono">/collaborations</code> page title, rich markdown copy, and embedded partner logos.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href="/collaborations"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-700 font-mono text-xs transition-colors shadow-xs"
          >
            <span>👁️</span>
            <span>View Live Page</span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">↗</span>
          </Link>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs active:scale-95"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Status / Toast Alert ── */}
      {message && (
        <div
          className={`p-4 rounded-xl font-mono text-xs border flex items-center justify-between gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{message.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Editor Workspace ── */}
      {loading ? (
        <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 text-center font-mono text-xs text-slate-500 dark:text-zinc-500 space-y-3 shadow-xs">
          <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Loading collaborations content…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Title Input Card */}
          <div className="bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-semibold text-slate-800 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>📝</span>
                <span>Page Header Title</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                {title.length} / 120 characters
              </span>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Our Collaborations & Partnerships"
              maxLength={120}
              className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm font-sans font-medium text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-hidden focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-xs"
            />
          </div>

          {/* Rich Content Editor with Image Drag & Drop */}
          <div className="bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-0.5">
                <label className="text-xs font-mono font-semibold text-slate-800 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📄</span>
                  <span>Collaborations Content &amp; Media</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono">
                  Supports Markdown, HTML, embedded images (drag &amp; drop / paste), bullet lists, and links.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetTemplate}
                className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-300 underline"
              >
                Reset to Standard Template
              </button>
            </div>

            {/* Reused MarkdownEditorWithImages */}
            <MarkdownEditorWithImages
              value={content}
              onChange={(newVal) => setContent(newVal)}
              rows={14}
              placeholder="Write collaborations announcement, partner list, benefits, or embed image flyers..."
              problemPreviewData={{
                title: title,
                difficulty: 'Easy',
                points: 100,
                tags: ['Partnership', 'Community', 'Ecosystem'],
              }}
            />
          </div>

          {/* Bottom Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 shadow-xs">
            <div className="text-xs font-mono text-slate-500 dark:text-zinc-500 text-center sm:text-left">
              {lastSavedAt ? (
                <span>Last published: {new Date(lastSavedAt).toLocaleString()}</span>
              ) : (
                <span>No publication history yet</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/collaborations"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-zinc-700 font-mono text-xs transition-colors shadow-xs"
              >
                Preview Live
              </Link>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-xs disabled:opacity-50 transition-all shadow-xs active:scale-95"
              >
                {saving ? 'Saving…' : '💾 Save & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
