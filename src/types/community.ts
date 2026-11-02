// ════════════════════════════════════════════════════════════
// src/types/community.ts
// Types for Squads, Polls, Discussions, and Community Badges
// ════════════════════════════════════════════════════════════

export interface Squad {
  id: string;
  name: string;
  tag: string;
  code: string;
  leader_github: string;
  total_points: number;
  created_at: string;
  members?: SquadMember[];
  member_count?: number;
}

export interface SquadMember {
  id: string;
  squad_id: string;
  github: string;
  name: string;
  points_contributed: number;
  joined_at: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface CommunityPoll {
  id: string;
  question: string;
  options: PollOption[];
  created_by?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
  user_voted_option?: string | null;
  total_votes?: number;
}

export type ApproachType = 'intuitive' | 'brute_force' | 'optimized' | 'one_liner';

export interface ProblemDiscussion {
  id: string;
  problem_id: string;
  github: string;
  author_name: string;
  title: string;
  content: string;
  approach_type: ApproachType;
  upvotes: number;
  created_at: string;
  has_upvoted?: boolean;
}
