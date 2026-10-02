'use client';

/**
 * ProblemDiscussion
 *
 * Full-width discussion thread rendered below the Workspace editor.
 * Features:
 *  - Any logged-in user can post
 *  - Users with an approved submission for this problem get a ✓ Solved badge
 *  - One level of replies (reply to a top-level comment)
 *  - Admin can delete any comment or reply
 *  - Realtime updates via Supabase channel
 *
 * Supabase table required (run once in SQL editor):
 *
 *   CREATE TABLE problem_comments (
 *     id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *     problem_id text        NOT NULL,
 *     parent_id  uuid        REFERENCES problem_comments(id) ON DELETE CASCADE,
 *     github     text        NOT NULL,
 *     name       text        NOT NULL,
 *     body       text        NOT NULL,
 *     created_at timestamptz DEFAULT now()
 *   );
 *
 *   CREATE INDEX ON problem_comments (problem_id, created_at);
 *
 *   -- RLS: allow public read, authenticated insert, admin/owner delete
 *   ALTER TABLE problem_comments ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "public read"  ON problem_comments FOR SELECT USING (true);
 *   CREATE POLICY "auth insert"  ON problem_comments FOR INSERT WITH CHECK (true);
 *   CREATE POLICY "auth delete"  ON problem_comments FOR DELETE USING (true);
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';

// ── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id:         string;
  problem_id: string;
  parent_id:  string | null;
  github:     string;
  name:       string;
  body:       string;
  created_at: string;
  replies?:   Comment[];
}

interface Props {
  problemId:    string;
  problemTitle: string;
  user:         User | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ github, size = 28 }: { github: string; size?: number }) {
  return (
    <img
      src={`https://github.com/${github}.png?size=${size * 2}`}
      alt={github}
      width={size}
      height={size}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      className="rounded-full ring-1 ring-[#2a2a2a] shrink-0 bg-[#111] object-cover"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function CommentInput({
  placeholder,
  onSubmit,
  onCancel,
  autoFocus = false,
  problemTitle = '',
}: {
  placeholder:   string;
  onSubmit:      (body: string) => Promise<void>;
  onCancel?:     () => void;
  autoFocus?:    boolean;
  problemTitle?: string;
}) {
  const [body,          setBody]          = useState('');
  const [posting,       setPosting]       = useState(false);
  const [checking,      setChecking]      = useState(false);
  const [spoilerWarn,   setSpoilerWarn]   = useState<{ reason: string; suggestion: string } | null>(null);
  const [pendingBody,   setPendingBody]   = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || posting || checking) return;

    // Run spoiler check if we have a problem title and the comment is long enough
    if (problemTitle && trimmed.length >= 30) {
      setChecking(true);
      try {
        const { detectSpoiler } = await import('@/lib/gemini');
        const result = await detectSpoiler(problemTitle, trimmed);
        if (result.isSpoiler && result.confidence !== 'low') {
          // Show warning — don't post yet
          setSpoilerWarn({ reason: result.reason, suggestion: result.suggestion });
          setPendingBody(trimmed);
          setChecking(false);
          return;
        }
      } catch {
        // If check fails, allow posting
      }
      setChecking(false);
    }

    await doPost(trimmed);
  }

  async function doPost(text: string) {
    setPosting(true);
    setSpoilerWarn(null);
    setPendingBody('');
    try {
      await onSubmit(text);
      setBody('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5
          text-zinc-200 text-sm font-mono placeholder-zinc-500 resize-none
          focus:outline-none focus:border-cyan-500/80 transition-colors"
      />

      {/* Spoiler warning */}
      {spoilerWarn && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 text-base shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-mono font-bold text-amber-400 mb-1">
                This might be a spoiler
              </p>
              {spoilerWarn.reason && (
                <p className="text-[10px] font-mono text-zinc-300 leading-relaxed">
                  {spoilerWarn.reason}
                </p>
              )}
              {spoilerWarn.suggestion && (
                <p className="text-[10px] font-mono text-zinc-400 leading-relaxed mt-1">
                  💡 {spoilerWarn.suggestion}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setSpoilerWarn(null); setPendingBody(''); }}
              className="flex-1 py-2 text-xs font-mono font-medium bg-zinc-900 text-zinc-300
                rounded-lg hover:bg-zinc-800 transition-colors border border-zinc-800"
            >
              ✏ Edit comment
            </button>
            <button
              onClick={() => doPost(pendingBody)}
              disabled={posting}
              className="flex-1 py-2 text-xs font-mono font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950
                rounded-lg disabled:opacity-50 transition-colors"
            >
              Post anyway &rarr;
            </button>
          </div>
        </div>
      )}

      {!spoilerWarn && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">Ctrl+Enter to post</span>
          <div className="flex gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!body.trim() || posting || checking}
              className="px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-cyan-500 text-zinc-950 text-xs font-mono font-bold rounded-lg
                hover:opacity-90 shadow-[0_0_15px_rgba(0,229,255,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {checking ? '✦ Checking…' : posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  user,
  solvedSet,
  isAdmin,
  onReply,
  onDelete,
  depth = 0,
}: {
  comment:   Comment;
  user:      User | null;
  solvedSet: Set<string>;
  isAdmin:   boolean;
  onReply:   (parentId: string, body: string) => Promise<void>;
  onDelete:  (id: string) => Promise<void>;
  depth?:    number;
}) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const isSolved = solvedSet.has(comment.github);
  const isOwn    = user?.github === comment.github;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(comment.id); } finally { setDeleting(false); }
  }

  return (
    <div className={`${depth > 0 ? 'ml-8 mt-2' : ''}`}>
      <div className={`flex gap-3 group ${depth > 0 ? 'bg-zinc-900/30 border border-zinc-800/60' : 'bg-zinc-900/50 border border-zinc-800/80'} rounded-2xl p-3.5`}>
        <Avatar github={comment.github} size={depth > 0 ? 24 : 28} />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-xs font-mono font-semibold text-zinc-200">{comment.name}</span>
            <span className="text-[10px] font-mono text-zinc-500">@{comment.github}</span>
            {isSolved && (
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-md
                bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ✓ Solved
              </span>
            )}
            <span className="text-[10px] font-mono text-zinc-500 ml-auto">{timeAgo(comment.created_at)}</span>
          </div>

          {/* Body */}
          <p className="text-sm font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
            {comment.body}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2">
            {/* Reply — only on top-level comments, only for logged-in users */}
            {depth === 0 && user && (
              <button
                onClick={() => setShowReplyBox(v => !v)}
                className="text-[10px] font-mono text-zinc-400 hover:text-cyan-400 transition-colors"
              >
                {showReplyBox ? 'Cancel' : '↩ Reply'}
              </button>
            )}
            {/* Delete — admin or own comment */}
            {(isAdmin || isOwn) && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-[10px] font-mono text-zinc-500 hover:text-rose-400 transition-colors ml-auto opacity-0 group-hover:opacity-100"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline reply box */}
      {showReplyBox && user && (
        <div className="ml-8 mt-2">
          <CommentInput
            placeholder={`Reply to @${comment.github}…`}
            autoFocus
            problemTitle={comment.problem_id}
            onCancel={() => setShowReplyBox(false)}
            onSubmit={async (body) => {
              await onReply(comment.id, body);
              setShowReplyBox(false);
            }}
          />
        </div>
      )}

      {/* Replies */}
      {(comment.replies || []).map(reply => (
        <CommentCard
          key={reply.id}
          comment={reply}
          user={user}
          solvedSet={solvedSet}
          isAdmin={isAdmin}
          onReply={onReply}
          onDelete={onDelete}
          depth={1}
        />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ProblemDiscussion({ problemId, problemTitle, user }: Props) {
  const db = getSupabaseClient();

  const [comments,   setComments]   = useState<Comment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [solvedSet,  setSolvedSet]  = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);

  const isAdmin = user?.is_admin ?? false;

  // ── Load comments ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const { data } = await (db.from('problem_comments') as any)
        .select('*')
        .eq('problem_id', problemId)
        .order('created_at', { ascending: true });

      const rows: Comment[] = data || [];

      // Build tree: top-level comments with replies nested
      const byId = new Map<string, Comment>();
      const roots: Comment[] = [];

      for (const row of rows) {
        byId.set(row.id, { ...row, replies: [] });
      }
      for (const row of rows) {
        if (row.parent_id && byId.has(row.parent_id)) {
          byId.get(row.parent_id)!.replies!.push(byId.get(row.id)!);
        } else if (!row.parent_id) {
          roots.push(byId.get(row.id)!);
        }
      }

      setComments(roots);
    } catch {}
    setLoading(false);
  }, [problemId]);

  // ── Load solved set (who has an approved submission for this problem) ───────

  const loadSolvedSet = useCallback(async () => {
    try {
      const { data } = await db
        .from('submissions')
        .select('github')
        .eq('problem_id', problemId)
        .eq('status', 'approved');
      setSolvedSet(new Set((data || []).map((r: any) => r.github)));
    } catch {}
  }, [problemId]);

  useEffect(() => {
    load();
    loadSolvedSet();

    // Realtime subscription
    const channel = db
      .channel(`discussion-${problemId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'problem_comments',
        filter: `problem_id=eq.${problemId}`,
      }, () => load())
      .subscribe();

    channelRef.current = channel;
    return () => { db.removeChannel(channel); };
  }, [problemId, load, loadSolvedSet]);

  // ── Post comment ───────────────────────────────────────────────────────────

  async function postComment(body: string, parentId?: string) {
    if (!user) return;
    await (db.from('problem_comments') as any).insert({
      problem_id: problemId,
      parent_id:  parentId || null,
      github:     user.github,
      name:       user.name,
      body,
    });
    // Realtime will trigger reload, but also reload immediately for snappy UX
    await load();
  }

  // ── Delete comment ─────────────────────────────────────────────────────────

  async function deleteComment(id: string) {
    // ON DELETE CASCADE handles replies automatically
    await (db.from('problem_comments') as any).delete().eq('id', id);
    await load();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalCount = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="col-span-full border-t border-zinc-800/80 mt-2 pt-6 pb-8 px-5 md:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <h3 className="font-semibold text-zinc-100 text-base">Discussion</h3>
        {!loading && totalCount > 0 && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
            {totalCount} comment{totalCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Post box — only for logged-in users */}
      {user ? (
        <div className="flex gap-3 mb-6">
          <Avatar github={user.github} size={28} />
          <div className="flex-1">
            <CommentInput
              placeholder="Share your approach, ask a question, or help others…"
              problemTitle={problemTitle}
              onSubmit={(body) => postComment(body)}
            />
          </div>
        </div>
      ) : (
        <div className="mb-6 px-4 py-3 bg-zinc-900/40 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-400 text-center">
          Sign in to join the discussion
        </div>
      )}

      {/* Comments */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs py-4">
          <div className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
          Loading discussion…
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-3xl mb-2 opacity-20">💬</div>
          <div className="text-zinc-500 font-mono text-xs">No comments yet — be the first!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              user={user}
              solvedSet={solvedSet}
              isAdmin={isAdmin}
              onReply={(parentId, body) => postComment(body, parentId)}
              onDelete={deleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
