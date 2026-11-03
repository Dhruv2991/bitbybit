"use client";

import React, { useRef, useState } from "react";
import type { User } from "@/types/database";
import type { Badge } from "@/lib/badges";

interface DeveloperCardModalProps {
  user: User;
  stats: {
    totalPoints: number;
    problemsSolved: number;
    streak: number;
    rank: number | null;
    badges: Badge[];
    duelsWon?: number;
  };
  onClose: () => void;
}

export default function DeveloperCardModal({
  user,
  stats,
  onClose,
}: DeveloperCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareText = `Check out my Developer Card on BitByBit! 🔥 Streak: ${stats.streak} days | 🧩 Solved: ${stats.problemsSolved} problems | ⚡ Points: ${stats.totalPoints}. Join the arena: https://bitbybit.org`;

  function copyText() {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function shareWhatsApp() {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, "_blank");
  }

  function shareTwitter() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
  }

  function shareLinkedIn() {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://bitbybit.org")}`, "_blank");
  }

  // Draw card to HTML Canvas and trigger PNG download
  async function downloadPNG() {
    setDownloading(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630; // standard 1200x630 social card ratio
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 1. Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
      bgGrad.addColorStop(0, "#090d16");
      bgGrad.addColorStop(0.5, "#0d1527");
      bgGrad.addColorStop(1, "#0a0a14");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1200, 630);

      // 2. Cyber grid lines & decorative glow
      ctx.strokeStyle = "rgba(14, 165, 233, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 40; x < 1200; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 630);
        ctx.stroke();
      }
      for (let y = 40; y < 630; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1200, y);
        ctx.stroke();
      }

      // Outer Card Frame
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, 1140, 570);

      // Header branding
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 24px monospace";
      ctx.fillText("BITBYBIT // DEVELOPER CARD", 60, 80);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px monospace";
      ctx.fillText("AUTHENTICATED COMPETITIVE PROGRAMMER", 60, 110);

      // Name & GitHub
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText(user.name || user.github, 60, 200);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "24px monospace";
      ctx.fillText(`@${user.github}`, 60, 240);

      // Stat boxes
      const statsList = [
        { label: "DAILY STREAK", val: `${stats.streak} DAYS`, color: "#f59e0b" },
        { label: "PROBLEMS SOLVED", val: `${stats.problemsSolved}`, color: "#10b981" },
        { label: "TOTAL POINTS", val: `${stats.totalPoints}`, color: "#06b6d4" },
        { label: "GLOBAL RANK", val: stats.rank ? `#${stats.rank}` : "UNRANKED", color: "#a855f7" },
      ];

      statsList.forEach((st, i) => {
        const x = 60 + i * 270;
        const y = 310;
        // box background
        ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
        ctx.fillRect(x, y, 250, 120);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.strokeRect(x, y, 250, 120);

        // label
        ctx.fillStyle = "#64748b";
        ctx.font = "12px monospace";
        ctx.fillText(st.label, x + 20, y + 40);

        // value
        ctx.fillStyle = st.color;
        ctx.font = "bold 32px monospace";
        ctx.fillText(st.val, x + 20, y + 90);
      });

      // Badges Strip
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px monospace";
      ctx.fillText("UNLOCKED ACHIEVEMENTS:", 60, 480);

      const badgeIcons = stats.badges.slice(0, 8).map((b) => b.icon).join("  ") || "🎯  ⚡  🔥";
      ctx.font = "34px sans-serif";
      ctx.fillText(badgeIcons, 60, 530);

      // Watermark footer
      ctx.fillStyle = "#475569";
      ctx.font = "14px monospace";
      ctx.fillText("VERIFIED ON BITBYBIT.ORG • COMMUNITY DRIVEN CODING", 60, 580);

      // Download link
      const link = document.createElement("a");
      link.download = `bitbybit-card-${user.github}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Canvas draw error", e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono transition"
        >
          ✕
        </button>

        {/* Header */}
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 rounded-full font-bold">
            Public Card
          </span>
          <h2 className="text-xl font-bold font-mono text-white mt-1">
            Developer Trading Card
          </h2>
          <p className="text-xs font-mono text-slate-400">
            Share your progress, streak, and achievements with your friends or on social media.
          </p>
        </div>

        {/* Live Card Preview */}
        <div
          ref={cardRef}
          className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-sky-500/40 rounded-xl p-5 relative overflow-hidden shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <img
                src={`https://github.com/${user.github}.png`}
                alt={user.github}
                className="w-12 h-12 rounded-full border border-sky-400/40 bg-slate-800"
                onError={(e) => {
                  (e.target as any).src = `https://github.com/identicons/${user.github}.png`;
                }}
              />
              <div>
                <h3 className="font-bold text-base text-white">{user.name || user.github}</h3>
                <p className="text-xs font-mono text-sky-400">@{user.github}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Rank
              </span>
              <span className="text-sm font-bold font-mono text-purple-400">
                {stats.rank ? `#${stats.rank}` : "Unranked"}
              </span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[10px] font-mono text-slate-400 block">Streak</span>
              <span className="text-sm font-bold font-mono text-amber-400">
                🔥 {stats.streak}d
              </span>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[10px] font-mono text-slate-400 block">Solved</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                🧩 {stats.problemsSolved}
              </span>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[10px] font-mono text-slate-400 block">Points</span>
              <span className="text-sm font-bold font-mono text-sky-400">
                ⚡ {stats.totalPoints}
              </span>
            </div>
          </div>

          {/* Badges Strip */}
          <div className="pt-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
              Unlocked Badges ({stats.badges.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {stats.badges.slice(0, 6).map((b) => (
                <span
                  key={b.id}
                  title={b.label}
                  className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-xs font-mono flex items-center gap-1"
                >
                  <span>{b.icon}</span>
                  <span className="text-[10px] text-slate-300">{b.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Card Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
            <span>BITBYBIT.ORG // PRO</span>
            <span>VERIFIED DEVELOPER</span>
          </div>
        </div>

        {/* Share and Download Actions */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={downloadPNG}
              disabled={downloading}
              className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20"
            >
              <span>📥</span>
              <span>{downloading ? "Generating..." : "Download Card (PNG)"}</span>
            </button>
            <button
              onClick={copyText}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition border border-slate-700"
            >
              {copied ? "✓ Copied!" : "📋 Copy Text"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={shareWhatsApp}
              className="py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-mono text-xs transition flex items-center justify-center gap-1.5"
            >
              <span>💬 WhatsApp</span>
            </button>
            <button
              onClick={shareTwitter}
              className="py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 font-mono text-xs transition flex items-center justify-center gap-1.5"
            >
              <span>🐦 X / Twitter</span>
            </button>
            <button
              onClick={shareLinkedIn}
              className="py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-mono text-xs transition flex items-center justify-center gap-1.5"
            >
              <span>💼 LinkedIn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

