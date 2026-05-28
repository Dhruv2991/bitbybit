// ════════════════════════════════════════════════════════════
// src/types/database.ts
// ════════════════════════════════════════════════════════════

export type Difficulty       = 'Easy' | 'Medium' | 'Hard';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type ContestStatus    = 'upcoming' | 'live' | 'ended';
export type RegStatus        = 'pending' | 'confirmed' | 'rejected';
export type ArenaStatus      = 'submitted' | 'disqualified' | 'reviewed';

export interface TestCase { input: string; expected: string; }

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
  // When true this problem is arena-only and hidden from the public Problems page
  is_contest_problem?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string; github: string; name: string;
  total_points: number; problems_solved: number;
  streak: number; last_solved_at: string | null; created_at: string;
}

export interface Submission {
  id: string; problem_id: string; problem_title: string;
  github: string; name: string; lang: string; code: string;
  approach: string; status: SubmissionStatus;
  tests_passed: number; tests_total: number;
  points_awarded: number; reject_reason: string | null; created_at: string;
}

export interface Contest {
  id: string;
  name: string;
  entry_fee: number;
  duration_mins: number;
  upi_id: string;
  prize_note: string;
  leaderboard_discount: number;
  // Legacy single-problem field (kept for DB compat)
  problem_id: string | null;
  // Multi-problem support: array of problem IDs for this contest
  problem_ids: string[];
  status: ContestStatus;
  created_at: string;
}

export interface ContestRegistration {
  id: string; contest_id: string; contest_name: string;
  github: string; name: string; txn_id: string | null;
  status: RegStatus; created_at: string;
}

export interface ArenaSubmission {
  id: string; contest_id: string | null; contest_name: string;
  github: string; name: string; lang: string; code: string;
  strikes: number; status: ArenaStatus;
  strike_penalty_factor: number; points_awarded: number; created_at: string;
}

export interface Database {
  public: {
    Tables: {
      admins:                { Row: { github: string }; Insert: { github: string }; Update: { github?: string } };
      members:               { Row: Member; Insert: Omit<Member,'id'|'created_at'>; Update: Partial<Member> };
      problems:              { Row: Problem; Insert: Omit<Problem,'id'|'created_at'|'updated_at'>; Update: Partial<Problem> };
      submissions:           { Row: Submission; Insert: Omit<Submission,'id'|'created_at'>; Update: Partial<Submission> };
      contests:              { Row: Contest; Insert: Omit<Contest,'id'|'created_at'>; Update: Partial<Contest> };
      contest_registrations: { Row: ContestRegistration; Insert: Omit<ContestRegistration,'id'|'created_at'>; Update: Partial<ContestRegistration> };
      arena_submissions:     { Row: ArenaSubmission; Insert: Omit<ArenaSubmission,'id'|'created_at'>; Update: Partial<ArenaSubmission> };
    };
  };
}

export interface User { name: string; github: string; is_admin: boolean; }

export type SupportedLang = 'python' | 'javascript' | 'cpp' | 'java' | 'rust' | 'go';

export const LANG_KEYS: Record<SupportedLang, string> = {
  python:'python', javascript:'javascript', cpp:'cpp', java:'java', rust:'rust', go:'go',
};
export const LANG_LABELS: Record<SupportedLang, string> = {
  python:'Python 3', javascript:'JavaScript', cpp:'C++', java:'Java', rust:'Rust', go:'Go',
};

// Extract function name and params from a Python def line
// e.g. "def twoSum(nums, target):" → { name: 'twoSum', params: ['nums', 'target'] }
function parsePythonDef(starterCode: string): { name: string; params: string[] } {
  const match = starterCode.match(/def\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return { name: 'solution', params: [] };
  const name = match[1];
  const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
  return { name, params };
}

export const STARTER_CODE: Record<SupportedLang, (p?: Problem) => string> = {
  python: (p) => p?.starter_code ||
    'import sys\ninput = sys.stdin.read\n\ndef solution():\n    pass\n\nprint(solution())',

  javascript: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const args = params.join(', ');
    return [
      `const lines = require("fs").readFileSync("/dev/stdin","utf8").trim().split("\\n");`,
      ``,
      `function ${name}(${args}) {`,
      `  // Write your solution here`,
      `}`,
      ``,
      `console.log(${name}(${args}));`,
    ].join('\n');
  },

  cpp: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(p => `auto ${p}`).join(', ');
    return [
      `#include <bits/stdc++.h>`,
      `using namespace std;`,
      ``,
      `auto ${name}(${paramList}) {`,
      `    // Write your solution here`,
      `}`,
      ``,
      `int main() {`,
      `    ios_base::sync_with_stdio(false);`,
      `    cin.tie(NULL);`,
      `    // Parse input and call ${name}()`,
      `    return 0;`,
      `}`,
    ].join('\n');
  },

  java: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(p => `Object ${p}`).join(', ');
    return [
      `import java.util.*;`,
      `import java.io.*;`,
      ``,
      `public class Main {`,
      `    public static Object ${name}(${paramList}) {`,
      `        // Write your solution here`,
      `        return null;`,
      `    }`,
      ``,
      `    public static void main(String[] args) throws Exception {`,
      `        Scanner sc = new Scanner(System.in);`,
      `        System.out.println(${name}(${params.map(() => 'null').join(', ')}));`,
      `    }`,
      `}`,
    ].join('\n');
  },

  rust: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(p => `${p}: &str`).join(', ');
    return [
      `use std::io::{self, BufRead};`,
      ``,
      `fn ${name}(${paramList}) -> String {`,
      `    // Write your solution here`,
      `    String::new()`,
      `}`,
      ``,
      `fn main() {`,
      `    let stdin = io::stdin();`,
      `    let mut lines = stdin.lock().lines();`,
      `    println!("{}", ${name}(${params.map(() => '""').join(', ')}));`,
      `}`,
    ].join('\n');
  },

  go: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(p => `${p} interface{}`).join(', ');
    return [
      `package main`,
      ``,
      `import (`,
      `    "bufio"`,
      `    "fmt"`,
      `    "os"`,
      `)`,
      ``,
      `func ${name}(${paramList}) interface{} {`,
      `    // Write your solution here`,
      `    return nil`,
      `}`,
      ``,
      `func main() {`,
      `    reader := bufio.NewReader(os.Stdin)`,
      `    _ = reader`,
      `    fmt.Println(${name}(${params.map(() => 'nil').join(', ')}));`,
      `}`,
    ].join('\n');
  },
};