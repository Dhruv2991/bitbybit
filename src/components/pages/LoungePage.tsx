"use client";

import React, { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { User } from "@/types/database";
import type { PageId } from "@/components/layout/AppShellContext";

interface LoungePageProps {
  user: User | null;
  onNavigate: (page: PageId) => void;
}

interface LoungePeer {
  github: string;
  name: string;
  goal?: string;
  joinedAt: string;
}

interface AudioStation {
  id: string;
  name: string;
  genre: string;
  icon: string;
  url: string;
}

const STATIONS: AudioStation[] = [
  {
    id: "lofi-beats",
    name: "Chillhop Study Beats",
    genre: "Lo-Fi Instrumental",
    icon: "☕",
    url: "https://streams.ilovemusic.de/iloveradio17.mp3", // reliable lofi/chill stream
  },
  {
    id: "rain-piano",
    name: "Rainy Night Ambience",
    genre: "Rain & Piano",
    icon: "🌧️",
    url: "https://stream.zeno.fm/f3wvbbqmdg8uv", // rain stream
  },
  {
    id: "synthwave",
    name: "Cyberpunk Synthwave",
    genre: "Electronic Focus",
    icon: "🌌",
    url: "https://stream.nightride.fm/chillsynth.mp3", // chillsynth stream
  },
];

const DEFAULT_PEERS = [
  { github: "alex_coder", name: "Alex Coder", goal: "Mastering Binary Trees", joinedAt: "10m ago" },
  { github: "priya_dev", name: "Priya D.", goal: "Solving Daily Challenge", joinedAt: "24m ago" },
  { github: "karthik_algo", name: "Karthik K.", goal: "Graph DFS Practice", joinedAt: "35m ago" },
  { github: "ananya_s", name: "Ananya Sharma", goal: "Placement Gauntlet Prep", joinedAt: "45m ago" },
];

export default function LoungePage({ user, onNavigate }: LoungePageProps) {
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStation, setSelectedStation] = useState<AudioStation>(STATIONS[0]);
  const [volume, setVolume] = useState(0.65);
  const [audioError, setAudioError] = useState(false);

  // Pomodoro state
  const [timerMode, setTimerMode] = useState<"focus" | "break">("focus");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Personal session goal
  const [sessionGoal, setSessionGoal] = useState("");
  const [goalCompleted, setGoalCompleted] = useState(false);

  // Peers state
  const [peers, setPeers] = useState<LoungePeer[]>(DEFAULT_PEERS);
  const [waveReceived, setWaveReceived] = useState<string | null>(null);

  // 1. Audio controls
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(selectedStation.url);
      audioRef.current.volume = volume;
    } else {
      audioRef.current.src = selectedStation.url;
      audioRef.current.volume = volume;
      if (isPlaying) {
        audioRef.current.play().catch(() => setAudioError(true));
      }
    }

    return () => {
      audioRef.current?.pause();
    };
  }, [selectedStation]);

  function togglePlay() {
    if (!audioRef.current) return;
    setAudioError(false);

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setAudioError(true);
          setIsPlaying(false);
        });
    }
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }

  // 2. Pomodoro countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Switch mode
      if (timerMode === "focus") {
        setTimerMode("break");
        setTimeLeft(5 * 60);
      } else {
        setTimerMode("focus");
        setTimeLeft(25 * 60);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning, timeLeft, timerMode]);

  function resetTimer(mode: "focus" | "break") {
    setTimerMode(mode);
    setTimerRunning(false);
    setTimeLeft(mode === "focus" ? 25 * 60 : 5 * 60);
  }

  // 3. Realtime presence & waves
  useEffect(() => {
    const db = getSupabaseClient();
    const ch = db.channel("lounge-study-room");

    ch.on("broadcast", { event: "wave" }, ({ payload }) => {
      if (payload?.sender) {
        setWaveReceived(`${payload.sender} sent a ${payload.emoji || "👋"} wave!`);
        setTimeout(() => setWaveReceived(null), 4000);
      }
    }).subscribe();

    return () => {
      db.removeChannel(ch);
    };
  }, []);

  function sendWave(emoji: string) {
    const db = getSupabaseClient();
    const ch = db.channel("lounge-study-room");
    ch.send({
      type: "broadcast",
      event: "wave",
      payload: {
        sender: user?.name || user?.github || "Fellow Coder",
        emoji,
      },
    });
    setWaveReceived(`You sent a ${emoji} wave to the lounge!`);
    setTimeout(() => setWaveReceived(null), 3000);
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const timerPct =
    timerMode === "focus"
      ? Math.round(((25 * 60 - timeLeft) / (25 * 60)) * 100)
      : Math.round(((5 * 60 - timeLeft) / (5 * 60)) * 100);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-up">
      {/* Wave Toast */}
      {waveReceived && (
        <div className="fixed top-20 right-6 z-50 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-mono text-xs shadow-xl animate-fade-in flex items-center gap-2">
          <span>✨</span>
          <span>{waveReceived}</span>
        </div>
      )}

      {/* Hero Atmosphere Header */}
      <div className="bg-gradient-to-r from-slate-950 via-purple-950/40 to-slate-950 border border-purple-500/30 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Virtual Coding Lounge
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Study With Me • BitByBit
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              The Midnight Study Cafe 🎧
            </h1>

            <p className="text-xs font-mono text-slate-300 max-w-xl leading-relaxed">
              Plug in your headphones, stream ambient beats, sync with the community Pomodoro timer, and code alongside fellow students late into the night.
            </p>
          </div>

          {/* Quick Active Solvers Count */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shrink-0 font-mono backdrop-blur-md">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Active in Lounge
              </span>
              <span className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                <span>👥 {peers.length + 1} developers</span>
              </span>
            </div>
            <div className="flex -space-x-2">
              {peers.slice(0, 4).map((p) => (
                <img
                  key={p.github}
                  src={`https://github.com/${p.github}.png`}
                  alt={p.name}
                  className="w-7 h-7 rounded-full border-2 border-slate-900 bg-slate-800"
                  onError={(e) => {
                    (e.target as any).src = `https://github.com/identicons/${p.github}.png`;
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Lo-Fi Music Player & Session Goals (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Audio Player Card */}
          <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedStation.icon}</span>
                <div>
                  <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-zinc-100">
                    {selectedStation.name}
                  </h3>
                  <p className="text-[11px] font-mono text-purple-600 dark:text-purple-400">
                    {selectedStation.genre} • High-Fidelity Focus Stream
                  </p>
                </div>
              </div>

              {/* Play / Pause Big Button */}
              <button
                onClick={togglePlay}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition shadow-lg ${
                  isPlaying
                    ? "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 animate-pulse"
                    : "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:scale-105"
                }`}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
            </div>

            {audioError && (
              <p className="text-[11px] font-mono text-amber-500">
                ⚠️ Click play again to enable audio streaming in this browser session.
              </p>
            )}

            {/* Station Selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-bold">
                Select Ambient Station
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {STATIONS.map((st) => {
                  const isCur = selectedStation.id === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        setSelectedStation(st);
                        setIsPlaying(true);
                      }}
                      className={`p-3 rounded-xl border text-left transition font-mono ${
                        isCur
                          ? "bg-purple-500/15 border-purple-500/40 text-purple-900 dark:text-purple-200 shadow-xs"
                          : "bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{st.icon}</span>
                        <span className="text-xs font-bold truncate">{st.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">{st.genre}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs font-mono text-slate-400">🔊 Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="flex-1 accent-purple-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg"
              />
              <span className="text-xs font-mono text-slate-400 w-10 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          {/* Session Goal Tracker */}
          <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-sm space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-bold block">
              🎯 My Focus Goal For This Session
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Solve 2 Graph BFS problems & finish Weekly Challenge"
                value={sessionGoal}
                onChange={(e) => {
                  setSessionGoal(e.target.value);
                  setGoalCompleted(false);
                }}
                className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-purple-500"
              />
              {sessionGoal && (
                <button
                  onClick={() => setGoalCompleted(!goalCompleted)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                    goalCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                  }`}
                >
                  {goalCompleted ? "✓ Completed!" : "Mark Done"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Communal Pomodoro Timer & Peers (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pomodoro Timer */}
          <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm space-y-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => resetTimer("focus")}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                  timerMode === "focus"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100"
                }`}
              >
                🧠 Focus (25m)
              </button>
              <button
                onClick={() => resetTimer("break")}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition ${
                  timerMode === "break"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100"
                }`}
              >
                ☕ Rest (5m)
              </button>
            </div>

            {/* Giant Digits */}
            <div className="py-2">
              <div className="text-5xl sm:text-6xl font-mono font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                {formatTime(timeLeft)}
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-2">
                {timerRunning
                  ? timerMode === "focus"
                    ? "Deep work session in progress..."
                    : "Take a breath & stretch your eyes!"
                  : "Paused — click start when ready"}
              </p>
            </div>

            {/* Timer Actions */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setTimerRunning(!timerRunning)}
                className={`px-6 py-2.5 rounded-xl font-mono text-xs font-bold transition shadow-sm ${
                  timerRunning
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "bg-purple-600 text-white hover:bg-purple-500 shadow-purple-600/20"
                }`}
              >
                {timerRunning ? "Pause Timer" : "Start Session"}
              </button>
              <button
                onClick={() => resetTimer(timerMode)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 font-mono text-xs transition"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Social Waves & Peer Presence List */}
          <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-900 dark:text-zinc-100">
                Say Hi to Room ({peers.length + 1})
              </span>
              <div className="flex items-center gap-1.5">
                {["👋", "☕", "💻", "🔥", "🚀"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendWave(emoji)}
                    className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center text-sm transition transform active:scale-125 cursor-pointer"
                    title={`Send ${emoji} wave`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Peers List */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {peers.map((p) => (
                <div
                  key={p.github}
                  className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/80 rounded-xl p-2.5 text-xs font-mono"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={`https://github.com/${p.github}.png`}
                      alt={p.name}
                      className="w-6 h-6 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-200 dark:bg-zinc-800 shrink-0"
                      onError={(e) => {
                        (e.target as any).src = `https://github.com/identicons/${p.github}.png`;
                      }}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-zinc-200 truncate block">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate block">
                        {p.goal || "Deep Coding"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-500 font-bold shrink-0">
                    Studying
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Launchpad Dock */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-white">
        <div className="flex items-center gap-2">
          <span>⚡ Ready to code while listening?</span>
          <span className="text-slate-400">Jump directly into a challenge:</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => onNavigate("problems")}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold transition"
          >
            🗺️ Quest Roadmap
          </button>
          <button
            onClick={() => onNavigate("duels")}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold transition"
          >
            ⚔️ 1v1 Duels
          </button>
          <button
            onClick={() => onNavigate("weekly")}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold transition"
          >
            🏅 Weekly DSA
          </button>
        </div>
      </div>
    </div>
  );
}
