"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { User } from "@/types/database";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

interface ProblemLivePresenceProps {
  problemId: string;
  problemTitle: string;
  user: User | null;
  failedAttempts?: number;
}

interface PeerInfo {
  github: string;
  name: string;
}

const AMBIENT_PEERS = ["alex_dev", "priya_codes", "karthik_algo", "dev_sam", "sarah_k"];

export default function ProblemLivePresence({
  problemId,
  problemTitle,
  user,
  failedAttempts = 0,
}: ProblemLivePresenceProps) {
  const [activePeers, setActivePeers] = useState<PeerInfo[]>([]);
  const [tickerMsg, setTickerMsg] = useState<string | null>(null);
  const [showNudge, setShowNudge] = useState(false);

  // Derive stable presence key
  const presenceKey = useMemo(() => {
    return user?.github || "guest-coder";
  }, [user?.github]);

  const presenceData = useMemo(() => {
    if (!user?.github) return undefined;
    return {
      github: user.github,
      name: user.name || user.github,
      problemId,
    };
  }, [user?.github, user?.name, problemId]);

  // Use reusable realtime hook with automatic channel cleanup on unmount
  useRealtimeChannel({
    channelName: `problem-presence-${problemId}`,
    presenceKey,
    presenceData,
    onPresenceSync: (presenceState) => {
      const users: PeerInfo[] = [];
      for (const k in presenceState) {
        const pres = presenceState[k] as any[];
        if (pres && pres[0]) {
          users.push({
            github: pres[0].github || k,
            name: pres[0].name || k,
          });
        }
      }
      setActivePeers(users);
    },
    broadcastEvents: [
      {
        event: "peer_event",
        callback: (payload) => {
          if (payload?.text) {
            setTickerMsg(payload.text);
            setTimeout(() => setTickerMsg(null), 5000);
          }
        },
      },
    ],
    enabled: !!problemId,
  });

  // If user failed 2+ test runs, offer Socratic Nudge
  useEffect(() => {
    if (failedAttempts >= 2) {
      setShowNudge(true);
    }
  }, [failedAttempts]);

  // Combined real + ambient count for a vibrant community feel
  const baseCount = Math.max(activePeers.length, 3);
  const displayCount =
    baseCount +
    (Math.abs(problemId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 14);

  const displayAvatars =
    activePeers.length > 0 ? activePeers.map((p) => p.github) : AMBIENT_PEERS.slice(0, 4);

  return (
    <div className="space-y-3 mb-5 animate-fade-in" role="region" aria-label="Live problem presence">
      {/* Live Presence Bar */}
      <div className="bg-slate-100/80 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>

          <span className="text-slate-700 dark:text-zinc-300 font-medium truncate">
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
              {displayCount} coders
            </strong>{" "}
            tackling this problem with you
          </span>
        </div>

        {/* Avatars Stack */}
        <div className="flex items-center -space-x-1.5 shrink-0" aria-label="Coders currently active">
          {displayAvatars.map((gh, i) => (
            <img
              key={gh + i}
              src={`https://github.com/${gh}.png`}
              alt={`@${gh}`}
              title={`@${gh} is coding`}
              className="w-5 h-5 rounded-full border border-white dark:border-zinc-900 bg-slate-200 dark:bg-zinc-800 object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = `https://github.com/identicons/${gh}.png`;
              }}
            />
          ))}
        </div>
      </div>

      {/* Live Community Event Ticker */}
      {tickerMsg && (
        <div
          role="status"
          className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-lg px-3 py-1.5 text-[11px] font-mono text-sky-700 dark:text-sky-300 flex items-center gap-2 animate-fade-in"
        >
          <span aria-hidden="true">⚡</span>
          <span>{tickerMsg}</span>
        </div>
      )}

      {/* Socratic Helper Card when stuck */}
      {showNudge && (
        <div
          role="alert"
          aria-live="polite"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-2 text-xs font-mono"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold">
              <span aria-hidden="true">💡</span>
              <span>Stuck on a test case? (Socratic Nudge)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowNudge(false)}
              aria-label="Dismiss Socratic Nudge"
              className="text-amber-600 hover:text-amber-800 dark:hover:text-amber-300 font-mono text-xs p-1"
            >
              ✕
            </button>
          </div>
          <p className="text-slate-700 dark:text-zinc-300 leading-relaxed text-[11px]">
            Don't get discouraged! Think through these questions:
            <br />
            1. <strong>Edge cases:</strong> What happens with empty inputs, negative values, or duplicate elements?
            <br />
            2. <strong>Index bounds:</strong> Are loop boundaries stopping before or after the last element?
            <br />
            3. <strong>Data structure state:</strong> Is your cache, hash map, or stack cleared between runs?
          </p>
          <div className="flex items-center gap-3 pt-1 text-[11px]">
            <a
              href="#community-discussions"
              className="text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
            >
              <span>⬇️ See ELI5 peer intuitions below</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
