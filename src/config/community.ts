// ════════════════════════════════════════════════════════════
// src/config/community.ts
// Centralized Community, Clan, Duel & Lounge Configuration
// ════════════════════════════════════════════════════════════

import type { GhostRun } from "@/types/ghost";
import type { CommunityPoll } from "@/types/community";

export const COMMUNITY_POINTS = {
  GHOST_DUEL_WIN: 100,
  SQUAD_GHOST_DUEL_BOOST: 50,
  LIVE_DUEL_WIN: 150,
  DISCUSSION_UPVOTE_KARMA: 15,
  DAILY_GHOST_DUEL_XP_CAP: 500, // Maximum 500 XP per day from ghost duels (5 wins)
} as const;

/**
 * ONE Canonical Squad Points Formula:
 * - Ghost Duel Victory: +50 XP contributed to squad (COMMUNITY_POINTS.SQUAD_GHOST_DUEL_BOOST)
 * - Problem Solve: +10% of base problem points (minimum 5 XP) contributed to squad
 */
export function calculateSquadContribution(
  event: "ghost_duel_win" | "problem_solve",
  problemPoints = 0
): number {
  if (event === "ghost_duel_win") {
    return COMMUNITY_POINTS.SQUAD_GHOST_DUEL_BOOST;
  }
  if (event === "problem_solve") {
    return Math.max(5, Math.floor(Math.max(0, problemPoints) * 0.10));
  }
  return 0;
}

export const SQUAD_CONFIG = {
  MAX_MEMBERS: 5,
  CODE_LENGTH: 6,
  NAME_MIN_LEN: 3,
  NAME_MAX_LEN: 30,
  TAG_MIN_LEN: 2,
  TAG_MAX_LEN: 8,
} as const;

export const LOUNGE_CONFIG = {
  FOCUS_DURATION_SECS: 25 * 60,
  BREAK_DURATION_SECS: 5 * 60,
  STATIONS: [
    {
      id: "lofi-beats",
      name: "Chillhop Study Beats",
      genre: "Lo-Fi Instrumental",
      icon: "☕",
      url: "https://ilm.stream18.radiohost.de/ilm_ilovechillhop_mp3-192",
    },
    {
      id: "rain-piano",
      name: "Ambient Space Focus",
      genre: "Calm & Ambient",
      icon: "🌧️",
      url: "https://stream.nightride.fm/spacesynth.mp3",
    },
    {
      id: "synthwave",
      name: "Cyberpunk Synthwave",
      genre: "Electronic Focus",
      icon: "🌌",
      url: "https://stream.nightride.fm/chillsynth.mp3",
    },
  ],
} as const;

export const INPUT_LIMITS = {
  DISCUSSION_TITLE_MIN: 3,
  DISCUSSION_TITLE_MAX: 120,
  DISCUSSION_CONTENT_MIN: 10,
  DISCUSSION_CONTENT_MAX: 5000,
  POLL_QUESTION_MAX: 200,
  SESSION_GOAL_MAX: 100,
} as const;

export const CANONICAL_DAILY_POLL: CommunityPoll = {
  id: "00000000-0000-0000-0000-000000000010",
  question: "🔥 Daily Debate: Recursion vs Iteration in Technical Interviews — which is your go-to?",
  options: [
    { id: "opt-1", text: "Recursion (Cleaner, easier to visualize trees/graphs)", votes: 42 },
    { id: "opt-2", text: "Iteration (No stack overflow risk, faster in prod)", votes: 68 },
    { id: "opt-3", text: "Depends on whether the interviewer asks for O(1) space", votes: 85 },
  ],
  is_active: true,
  created_at: "2026-11-01T00:00:00.000Z",
};

export const SEED_GHOSTS: GhostRun[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    problem_id: "two-sum",
    problem_title: "Two Sum",
    github: "arjun_dev",
    user_name: "Arjun Verma",
    user_avatar:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
    time_seconds: 145, // 02:25
    language: "python",
    code_length: 198,
    checkpoints: [
      { at: 15, label: "Analyzing problem & constraints" },
      { at: 40, label: "Initialized complement hash map" },
      { at: 90, label: "Passed sample test cases" },
      { at: 145, label: "Submitted & 100% tests passed!" },
    ],
    is_verified: true,
    created_at: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    problem_id: "valid-parentheses",
    problem_title: "Valid Parentheses",
    github: "karthik_r",
    user_name: "Karthik R.",
    user_avatar:
      "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=face",
    time_seconds: 190, // 03:10
    language: "javascript",
    code_length: 240,
    checkpoints: [
      { at: 20, label: "Drafted bracket stack structure" },
      { at: 65, label: "Handling closing bracket match logic" },
      { at: 130, label: "Passed edge case: odd length & empty stack" },
      { at: 190, label: "Submitted & 100% tests passed!" },
    ],
    is_verified: true,
    created_at: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    problem_id: "reverse-linked-list",
    problem_title: "Reverse Linked List",
    github: "sneha_codes",
    user_name: "Sneha Patel",
    user_avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
    time_seconds: 110, // 01:50
    language: "python",
    code_length: 165,
    checkpoints: [
      { at: 12, label: "Pointer initialization (prev, curr, next)" },
      { at: 45, label: "Implemented three-pointer reversal loop" },
      { at: 80, label: "Validated single-node & empty list cases" },
      { at: 110, label: "Submitted & 100% tests green!" },
    ],
    is_verified: true,
    created_at: "2026-11-01T00:00:00.000Z",
  },
];
