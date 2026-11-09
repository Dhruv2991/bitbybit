"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

interface FloatingEmoji {
  id: string;
  emoji: string;
  sender: string;
  leftPercent: number;
}

interface FloatingEmojiReactionsProps {
  roomId: string;
  userName?: string;
  isSpectator?: boolean;
}

export const CHEER_EMOJIS = ["🔥", "🤯", "👏", "💀", "⚡", "🚀"] as const;

export default function FloatingEmojiReactions({
  roomId,
  userName = "Spectator",
  isSpectator = false,
}: FloatingEmojiReactionsProps) {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Clean up all pending particle removal timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const addEmojiParticle = useCallback((emoji: string, sender: string) => {
    const id = "emoji-" + Math.random().toString(36).substring(2, 9);
    const leftPercent = Math.floor(20 + Math.random() * 60); // 20% - 80% screen width

    setEmojis((prev) => [...prev, { id, emoji, sender, leftPercent }]);

    const timeoutId = setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
      timeoutsRef.current.delete(timeoutId);
    }, 2400);

    timeoutsRef.current.add(timeoutId);
  }, []);

  // Use reusable realtime hook for ephemeral cheer broadcast
  useRealtimeChannel({
    channelName: `duel-cheer-${roomId}`,
    broadcastEvents: [
      {
        event: "cheer",
        callback: (payload) => {
          if (payload?.emoji) {
            addEmojiParticle(payload.emoji, payload.sender || "Spectator");
          }
        },
      },
    ],
    enabled: !!roomId,
  });

  function sendReaction(emoji: string) {
    if (!roomId) return;
    addEmojiParticle(emoji, userName);

    try {
      const db = getSupabaseClient();
      const ch = db.channel(`duel-cheer-${roomId}`);
      ch.send({
        type: "broadcast",
        event: "cheer",
        payload: { emoji, sender: userName },
      });
    } catch (err) {
      console.warn("Could not broadcast cheer reaction:", err);
    }
  }

  return (
    <>
      {/* Floating Animated Emojis Screen Overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      >
        {emojis.map((item) => (
          <div
            key={item.id}
            className="absolute bottom-16 flex flex-col items-center animate-float-up motion-reduce:animate-none pointer-events-none select-none transition-all"
            style={{ left: `${item.leftPercent}%` }}
          >
            <span className="text-3xl filter drop-shadow-md">{item.emoji}</span>
            <span className="text-[10px] font-mono text-white/70 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-xs mt-0.5">
              {item.sender}
            </span>
          </div>
        ))}
      </div>

      {/* Floating Reaction Bar */}
      <div
        role="region"
        aria-label="Spectator cheer reactions"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 dark:bg-zinc-950/90 border border-slate-700 dark:border-zinc-800 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-2xl backdrop-blur-md"
      >
        {isSpectator && (
          <span className="text-[10px] font-mono text-sky-400 font-bold px-2 border-r border-slate-700 shrink-0">
            👀 SPECTATING
          </span>
        )}
        <div className="flex items-center gap-1">
          {CHEER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendReaction(emoji)}
              aria-label={`Cheer with ${emoji}`}
              className="w-8 h-8 rounded-full hover:bg-slate-800 dark:hover:bg-zinc-800 text-lg flex items-center justify-center transition transform active:scale-125 hover:scale-110 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
