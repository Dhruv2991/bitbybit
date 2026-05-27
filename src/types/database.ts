// ════════════════════════════════════════════════════════════
// src/types/database.ts — Types matching Schema.sql
// Updated: added Java, Rust, Go language support
// ════════════════════════════════════════════════════════════

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type ContestStatus = 'upcoming' | 'live' | 'ended';
export type RegStatus = 'pending' | 'confirmed' | 'rejected';
export type ArenaStatus = 'submitted' | 'disqualified' | 'reviewed';

export interface TestCase {
  input: string;
  expected: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  tags: string[];
  description: string;
  example: string;
  starter_code: string;
  test_cases: TestCase[];
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  github: string;
  name: string;
  total_points: number;
  problems_solved: number;
  streak: number;
  last_solved_at: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  problem_id: string;
  problem_title: string;
  github: string;
  name: string;
  lang: string;
  code: string;
  approach: string;
  status: SubmissionStatus;
  tests_passed: number;
  tests_total: number;
  points_awarded: number;
  reject_reason: string | null;
  created_at: string;
}

export interface Contest {
  id: string;
  name: string;
  entry_fee: number;
  duration_mins: number;
  upi_id: string;
  prize_note: string;
  leaderboard_discount: number;
  problem_id: string | null;
  status: ContestStatus;
  created_at: string;
}

export interface ContestRegistration {
  id: string;
  contest_id: string;
  contest_name: string;
  github: string;
  name: string;
  txn_id: string | null;
  status: RegStatus;
  created_at: string;
}

export interface ArenaSubmission {
  id: string;
  contest_id: string | null;
  contest_name: string;
  github: string;
  name: string;
  lang: string;
  code: string;
  strikes: number;
  status: ArenaStatus;
  strike_penalty_factor: number;
  points_awarded: number;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      admins:                { Row: { github: string }; Insert: { github: string }; Update: { github?: string } };
      members:               { Row: Member; Insert: Omit<Member, 'id' | 'created_at'>; Update: Partial<Member> };
      problems:              { Row: Problem; Insert: Omit<Problem, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Problem> };
      submissions:           { Row: Submission; Insert: Omit<Submission, 'id' | 'created_at'>; Update: Partial<Submission> };
      contests:              { Row: Contest; Insert: Omit<Contest, 'id' | 'created_at'>; Update: Partial<Contest> };
      contest_registrations: { Row: ContestRegistration; Insert: Omit<ContestRegistration, 'id' | 'created_at'>; Update: Partial<ContestRegistration> };
      arena_submissions:     { Row: ArenaSubmission; Insert: Omit<ArenaSubmission, 'id' | 'created_at'>; Update: Partial<ArenaSubmission> };
    };
  };
}

export interface User {
  name: string;
  github: string;
  is_admin: boolean;
}

export type SupportedLang = 'python' | 'javascript' | 'cpp' | 'java' | 'rust' | 'go';

// Language keys for the executor (see lib/executor.ts)
export const LANG_KEYS: Record<SupportedLang, string> = {
  python:     'python',
  javascript: 'javascript',
  cpp:        'cpp',
  java:       'java',
  rust:       'rust',
  go:         'go',
};

export const LANG_LABELS: Record<SupportedLang, string> = {
  python:     'Python 3',
  javascript: 'JavaScript',
  cpp:        'C++',
  java:       'Java',
  rust:       'Rust',
  go:         'Go',
};

export const STARTER_CODE: Record<SupportedLang, (p?: Problem) => string> = {
  python: (p) =>
    p?.starter_code ||
    'import sys\ninput = sys.stdin.read\n\ndef solution():\n    # Write your solution here\n    pass\n\nprint(solution())',
  javascript: () =>
    'const lines = require("fs").readFileSync("/dev/stdin","utf8").trim().split("\\n");\n\nfunction solution() {\n  // Write your solution here\n}\n\nconsole.log(solution());',
  cpp: () =>
    '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // Write your solution here\n    return 0;\n}',
  java: () =>
    'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}',
  rust: () =>
    'use std::io::{self, BufRead};\n\nfn main() {\n    let stdin = io::stdin();\n    let mut lines = stdin.lock().lines();\n    // Write your solution here\n}',
  go: () =>
    'package main\n\nimport (\n    "bufio"\n    "fmt"\n    "os"\n)\n\nfunc main() {\n    reader := bufio.NewReader(os.Stdin)\n    _ = reader\n    // Write your solution here\n    fmt.Println()\n}',
};
