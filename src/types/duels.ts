// ════════════════════════════════════════════════════════════
// src/types/duels.ts
// Real-Time 1v1 Code Duel Types & Payloads
// ════════════════════════════════════════════════════════════

export type DuelStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

export type DuelPlayerStatus = 'waiting' | 'coding' | 'running_tests' | 'submitted';

export interface DuelProgress {
  testsPassed: number;
  totalTests: number;
  status: DuelPlayerStatus;
  lastActiveLine?: number;
  lastUpdated?: string;
}

export interface CodeDuel {
  id: string;
  problem_id: string;
  problem_title?: string | null;
  time_limit_mins: number;
  host_id?: string | null;
  host_github: string;
  host_name: string;
  guest_id?: string | null;
  guest_github?: string | null;
  guest_name?: string | null;
  status: DuelStatus;
  host_progress: DuelProgress;
  guest_progress: DuelProgress;
  winner_id?: string | null;
  winner_github?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
}

export interface CreateDuelInput {
  problem_id: string;
  problem_title?: string;
  time_limit_mins?: number;
  host_github: string;
  host_name: string;
  host_id?: string;
}

export interface UpdateDuelProgressInput {
  duel_id: string;
  role: 'host' | 'guest';
  progress: Partial<DuelProgress>;
}
