// ════════════════════════════════════════════════════════════
// src/types/ghost.ts
// Ghost Duels: Asynchronous 1v1 Battle Types
// ════════════════════════════════════════════════════════════

export interface GhostCheckpoint {
  at: number; // Seconds elapsed from start when milestone occurred
  label: string; // e.g. "Started core logic", "Passed test 1/4", "All tests passed"
}

export interface GhostRun {
  id: string;
  problem_id: string;
  problem_title: string;
  github: string;
  user_name: string;
  user_avatar?: string | null;
  time_seconds: number;
  language: string;
  code_length: number;
  checkpoints: GhostCheckpoint[];
  is_verified?: boolean;
  created_at: string;
}

export interface GhostMatch {
  id: string;
  ghost_run_id?: string | null;
  problem_id: string;
  problem_title: string;
  challenger_github: string;
  challenger_name: string;
  challenger_time_seconds: number;
  result: "won" | "lost";
  time_diff_seconds: number;
  created_at: string;
}

export interface RecordGhostMatchInput {
  ghost_run_id?: string | null;
  problem_id: string;
  problem_title?: string;
  challenger_github: string;
  challenger_name?: string;
  challenger_time_seconds: number;
  submission_id?: string;
  token?: string;
}

export interface RecordGhostMatchResult {
  success: boolean;
  result: "won" | "lost";
  timeDiffSeconds: number;
  pointsAwarded: number;
  squadPointsAwarded: number;
  alreadyClaimed?: boolean;
  error?: string;
}
