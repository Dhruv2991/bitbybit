// ════════════════════════════════════════════════════════════
// src/types/database.ts
// ════════════════════════════════════════════════════════════

export type Difficulty       = 'Easy' | 'Medium' | 'Hard';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type ContestStatus    = 'upcoming' | 'live' | 'ended';
export type RegStatus        = 'pending' | 'confirmed' | 'rejected';
export type ArenaStatus      = 'submitted' | 'disqualified' | 'reviewed';

/**
 * A single test case.
 *
 * `input`    — JSON object whose keys match the function's parameter names.
 *              e.g.  { "nums": [2,7,11,15], "target": 9 }
 *
 * `expected` — JSON value that the function must return.
 *              e.g.  [0, 1]
 *
 * The executor deserialises both fields, calls the function directly
 * (no stdin/stdout parsing needed), then deep-compares the return value.
 */
export interface TestCase { input: string; expected: string; }

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  tags: string[];
  description: string;
  example: string;
  /**
   * A Python `def` line that declares the function signature.
   * e.g.  "def twoSum(nums, target):"
   * The platform derives the function name + params for all 6 language templates.
   */
  starter_code: string;
  test_cases: TestCase[];
  submission_count: number;
  /** When true this problem is arena-only and hidden from the public Problems page */
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
  problem_id: string | null;
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

// ── Parse the Python def line ─────────────────────────────────
// "def twoSum(nums, target):" → { name: 'twoSum', params: ['nums', 'target'] }
export function parsePythonDef(starterCode: string): { name: string; params: string[] } {
  const match = starterCode.match(/def\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return { name: 'solution', params: [] };
  const name   = match[1];
  const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
  return { name, params };
}

// ── Starter code templates ────────────────────────────────────
//
// Pure function bodies only — no stdin, no print, no main().
// The executor wraps these with a JSON harness that:
//   1. Deserialises the JSON input into typed arguments.
//   2. Calls the function.
//   3. Serialises the return value for comparison.
//
// Admin only needs to write one Python def line, e.g.:
//   def twoSum(nums, target):
// All 6 language stubs are generated automatically from it.

export const STARTER_CODE: Record<SupportedLang, (p?: Problem) => string> = {

  // ── Python ───────────────────────────────────────────────────
  // Clean function stub — just pass, no comments to misalign against.
  python: (p) => {
    if (!p?.starter_code) return 'def solution():\n    pass\n';
    const { name, params } = parsePythonDef(p.starter_code);
    return `def ${name}(${params.join(', ')}):\n    pass\n`;
  },

  // ── JavaScript ───────────────────────────────────────────────
  // Args arrive as plain JS values (arrays, numbers, strings, etc.)
  // — no parsing needed, just write the logic.
  javascript: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    return [
      `function ${name}(${params.join(', ')}) {`,
      ``,
      `}`,
    ].join('\n');
  },

  // ── C++ ──────────────────────────────────────────────────────
  // Args are nlohmann::json values injected by the harness.
  // Use .get<T>() to convert to the type you need:
  //   vector<int> nums_ = nums.get<vector<int>>();
  //   int target_       = target.get<int>();
  // Return any json-serialisable value (vector, int, string, etc.)
  cpp: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(q => `json ${q}`).join(', ');
    return [
      `#include <bits/stdc++.h>`,
      `#include <nlohmann/json.hpp>`,
      `using namespace std;`,
      `using json = nlohmann::json;`,
      ``,
      `// Each param is a nlohmann::json value.`,
      `// Convert with .get<T>(), e.g.:`,
      `//   vector<int> v = nums.get<vector<int>>();`,
      `//   int t = target.get<int>();`,
      `json ${name}(${paramList}) {`,
      ``,
      `}`,
    ].join('\n');
  },

  // ── Java ─────────────────────────────────────────────────────
  // Args arrive as Object (boxed from Gson JsonElement).
  // Cast to the type you need, e.g.:
  //   List<Integer> nums_ = (List<Integer>) nums;
  //   int target_         = ((Double) target).intValue();
  java: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(q => `Object ${q}`).join(', ');
    return [
      `import java.util.*;`,
      ``,
      `// Each param is a plain Java Object (List, Double, String, etc.)`,
      `// Cast to the type you need, e.g.:`,
      `//   List<Object> list = (List<Object>) nums;`,
      `//   int t = ((Double) target).intValue();`,
      `public class Main {`,
      `    public static Object ${name}(${paramList}) {`,
      ``,
      `        return null;`,
      `    }`,
      `}`,
    ].join('\n');
  },

  // ── Rust ─────────────────────────────────────────────────────
  // Args are serde_json::Value — pattern-match or use helper methods:
  //   let nums_vec: Vec<i64> = nums.as_array().unwrap()
  //       .iter().map(|x| x.as_i64().unwrap()).collect();
  //   let target_i = target.as_i64().unwrap();
  rust: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(q => `${q}: serde_json::Value`).join(', ');
    return [
      `use serde_json::Value;`,
      ``,
      `// Each param is a serde_json::Value.`,
      `// Extract with helpers, e.g.:`,
      `//   let v: Vec<i64> = nums.as_array().unwrap()`,
      `//       .iter().map(|x| x.as_i64().unwrap()).collect();`,
      `//   let t = target.as_i64().unwrap();`,
      `fn ${name}(${paramList}) -> Value {`,
      ``,
      `    Value::Null`,
      `}`,
    ].join('\n');
  },

  // ── Go ───────────────────────────────────────────────────────
  // Args are interface{} decoded from JSON (float64 for numbers,
  // []interface{} for arrays, map[string]interface{} for objects).
  // Type-assert to the concrete type you need:
  //   numsRaw := nums.([]interface{})
  //   target_ := int(target.(float64))
  go: (p) => {
    const { name, params } = parsePythonDef(p?.starter_code || '');
    const paramList = params.map(q => `${q} interface{}`).join(', ');
    return [
      `package main`,
      ``,
      `// Each param is interface{} decoded from JSON.`,
      `// Type-assert to the concrete type you need, e.g.:`,
      `//   nums_ := nums.([]interface{})`,
      `//   target_ := int(target.(float64))`,
      `func ${name}(${paramList}) interface{} {`,
      ``,
      `    return nil`,
      `}`,
    ].join('\n');
  },
};