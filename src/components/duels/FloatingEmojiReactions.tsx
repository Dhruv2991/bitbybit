"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";

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

const CHEER_EMOJIS = ["🔥", "🤯", "👏", "💀", "⚡", "🚀"];

export default function FloatingEmojiReactions({
  roomId,
  userName = "Spectator",
  isSpectator = false,
}: FloatingEmojiReactionsProps) {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const [channel, setChannel] = useState<any>(null);

  const addEmojiParticle = useCallback((emoji: string, sender: string) => {
    const id = "emoji-" + Math.random().toString(36).substring(2, 9);
    const leftPercent = Math.floor(20 + Math.random() * 60); // 20% - 80% screen width

    setEmojis((prev) => [...prev, { id, emoji, sender, leftPercent }]);

    // Remove particle after animation (2.5s)
    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2400);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const db = getSupabaseClient();
    const ch = db.channel(`duel-cheer-${roomId}`);

    ch.on("broadcast", { event: "cheer" }, ({ payload }) => {
      if (payload?.emoji) {
        addEmojiParticle(payload.emoji, payload.sender || "Spectator");
      }
    }).subscribe();

    setChannel(ch);

    return () => {
      db.removeChannel(ch);
    };
  }, [roomId, addEmojiParticle]);

  function sendReaction(emoji: string) {
    if (!channel) return;
    addEmojiParticle(emoji, userName);

    channel.send({
      type: "broadcast",
      event: "cheer",
      payload: { emoji, sender: userName },
    });
  }

  return (
    <>
      {/* Floating Animated Emojis Screen Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {emojis.map((item) => (
          <div
            key={item.id}
            className="absolute bottom-16 flex flex-col items-center animate-float-up pointer-events-none select-none transition-all"
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
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 dark:bg-zinc-950/90 border border-slate-700 dark:border-zinc-800 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-2xl backdrop-blur-md">
        {isSpectator && (
          <span className="text-[10px] font-mono text-sky-400 font-bold px-2 border-r border-slate-700 shrink-0">
            👀 SPECTATING
          </span>
        )}
        <div className="flex items-center gap-1">
          {CHEER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="w-8 h-8 rounded-full hover:bg-slate-800 dark:hover:bg-zinc-800 text-lg flex items-center justify-center transition transform active:scale-125 hover:scale-110 cursor-pointer"
              title={`Cheer ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

