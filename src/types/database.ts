// ════════════════════════════════════════════════════════════
// src/types/database.ts
// ════════════════════════════════════════════════════════════

export type Difficulty       = 'Easy' | 'Medium' | 'Hard';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type ContestStatus    = 'upcoming' | 'live' | 'ended';
export type RegStatus        = 'pending' | 'confirmed' | 'rejected';
export type ArenaStatus      = 'submitted' | 'disqualified' | 'reviewed';

export interface TestCase {
  input: string;
  expected: string;
  is_hidden?: boolean;
  explanation?: string;
}
import {
  cppType,
  javaType,
  goType,
  rustType
} from '@/lib/typeHelpers';

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  tags: string[];
  description: string;
  example: string;

  starter_code: string;

  param_types: string[];
  return_type: string;

  test_cases: TestCase[];

  hints?: string[];

  submission_count: number;

  is_contest_problem?: boolean;
  visibility?: 'public' | 'arena' | 'weekly';

  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  github: string;
  name: string;
  email?: string | null;
  email_subscribed?: boolean;

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

  leaderboard_discount: number;

  problem_id: string | null;

  problem_ids: string[];

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
  razorpay_order_id?:   string | null;
  razorpay_payment_id?: string | null;

  status: RegStatus;

  created_at: string;
}

export interface ArenaSubmission {
  id: string;

  contest_id: string | null;
  contest_name: string;

  problem_id: string | null;
  problem_title: string;

  github: string;
  name: string;

  lang: string;
  code: string;

  strikes: number;

  status: ArenaStatus;

  strike_penalty_factor: number;
  points_awarded: number;

  tests_passed: number;
  tests_total:  number;

  created_at: string;
}

export type CertificateStatus = 'issued' | 'revoked';
export type EmailDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface CertificateCoordinator {
  name: string;
  title: string;
  org: string;
  signatureText?: string;
}

export interface Certificate {
  id: string;
  certificate_id: string;
  member_id: string | null;
  github: string;
  recipient_name: string;
  recipient_email: string;
  certificate_type: string;
  title: string;
  achievement_text: string;
  event_name: string;
  organization_text: string;
  activity_points_text: string | null;
  coordinator_names: CertificateCoordinator[];
  issued_at: string;
  issued_by: string;
  pdf_path: string;
  status: CertificateStatus;
  email_status: EmailDeliveryStatus;
  email_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      certificates: {
        Row: Certificate;
        Insert: Omit<Certificate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Certificate>;
      };

      admins: {
        Row: {
          github: string;
        };

        Insert: {
          github: string;
        };

        Update: {
          github?: string;
        };
      };

      members: {
        Row: Member;

        Insert: Omit<
          Member,
          'id' | 'created_at'
        >;

        Update: Partial<Member>;
      };

      problems: {
        Row: Problem;

        Insert: Omit<
          Problem,
          'id' | 'created_at' | 'updated_at'
        >;

        Update: Partial<Problem>;
      };

      submissions: {
        Row: Submission;

        Insert: Omit<
          Submission,
          'id' | 'created_at'
        >;

        Update: Partial<Submission>;
      };

      contests: {
        Row: Contest;

        Insert: Omit<
          Contest,
          'id' | 'created_at'
        >;

        Update: Partial<Contest>;
      };

      contest_registrations: {
        Row: ContestRegistration;

        Insert: Omit<
          ContestRegistration,
          'id' | 'created_at'
        >;

        Update: Partial<ContestRegistration>;
      };

      arena_submissions: {
        Row: ArenaSubmission;

        Insert: Omit<
          ArenaSubmission,
          'id' | 'created_at'
        >;

        Update: Partial<ArenaSubmission>;
      };

      coupons: {
        Row: Coupon;

        Insert: Omit<Coupon, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };

        Update: Partial<Omit<Coupon, 'id' | 'created_at'>>;
      };

      subscribers: {
        Row: Subscriber;

        Insert: Omit<Subscriber, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };

        Update: Partial<Subscriber>;
      };

      email_unsubscribes: {
        Row: {
          id: string;
          email: string;
          reason: string | null;
          source: string;
          unsubscribed_at: string;
          created_at: string;
        };

        Insert: {
          id?: string;
          email: string;
          reason?: string | null;
          source?: string;
          unsubscribed_at?: string;
          created_at?: string;
        };

        Update: Partial<{
          email: string;
          reason: string | null;
          source: string;
          unsubscribed_at: string;
        }>;
      };
    };
  };
}

export type DiscountType = 'fixed' | 'percentage';

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  is_active: boolean;
  created_at: string;
}

export interface User {
  name: string;
  github: string;
  is_admin: boolean;
  /** Set by the subscription system; true if the user has an active subscription */
  is_subscriber?: boolean;
}


// ════════════════════════════════════════════════════════════
// Supported Languages
// ════════════════════════════════════════════════════════════

export type SupportedLang =
  | 'python'
  | 'javascript'
  | 'cpp'
  | 'java'
  | 'rust'
  | 'go';

export const LANG_KEYS: Record<
  SupportedLang,
  string
> = {

  python: 'python',
  javascript: 'javascript',
  cpp: 'cpp',
  java: 'java',
  rust: 'rust',
  go: 'go',
};

export const LANG_LABELS: Record<
  SupportedLang,
  string
> = {

  python: 'Python 3',
  javascript: 'JavaScript',
  cpp: 'C++',
  java: 'Java',
  rust: 'Rust',
  go: 'Go',
};

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

function parsePythonDef(
  starterCode: string
): {
  name: string;
  params: string[];
} {

  const match = starterCode.match(
    /def\s+(\w+)\s*\(([^)]*)\)/
  );

  if (!match) {
    return {
      name: 'solution',
      params: [],
    };
  }

  const name = match[1];

  const params = match[2]
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  return {
    name,
    params,
  };
}

// ════════════════════════════════════════════════════════════
// Starter Templates
// ════════════════════════════════════════════════════════════

export const STARTER_CODE: Record<
  SupportedLang,
  (p?: Problem) => string
> = {

  // ───────────────────────────────────
  // Python
  // ───────────────────────────────────
  python: (p) =>
    p?.starter_code ||
    `def solution():
    pass`,

  // ───────────────────────────────────
  // JavaScript
  // ───────────────────────────────────
  javascript: (p) => {

    const { name, params } = parsePythonDef(
      p?.starter_code || ''
    );

    const args = params.join(', ');

    return `function ${name}(${args}) {

    // Write your solution here

}`;
  },

  // ───────────────────────────────────
  // C++
  // Real typed parameters — no nlohmann/json wrappers.
  // The harness infers C++ types from the test-case JSON values
  // and injects native literals (e.g. std::vector<int>{2,7,11,15}).
  // Return type is detected from the user's signature and serialized
  // automatically — just write your logic and return the result.
  // ───────────────────────────────────
  cpp: (p) => {

  const { name, params } = parsePythonDef(
    p?.starter_code || ''
  );

  const types = p?.param_types || [];

  const paramList = params
    .map(
      (param, i) =>
        `${cppType(types[i] || 'int')} ${param}`
    )
    .join(', ');

  const returnType =
    cppType(p?.return_type || 'int');

  return `${returnType} ${name}(${paramList}) {

    // Write your solution here

}`;
},

  // ───────────────────────────────────
  // Java
  // ───────────────────────────────────
  java: (p) => {

  const { name, params } = parsePythonDef(
    p?.starter_code || ''
  );

  const types = p?.param_types || [];

  const paramList = params
    .map(
      (param, i) =>
        `${javaType(types[i] || 'string')} ${param}`
    )
    .join(', ');

  const returnType =
    javaType(p?.return_type || 'bool');

  return `public ${returnType} ${name}(${paramList}) {

}`;
},

  // ───────────────────────────────────
  // Rust
  // Real typed parameters — no serde_json::Value wrappers.
  // The harness injects native Rust literals (e.g. vec![2,7,11,15])
  // and serializes the return value automatically via serde_json.
  // ───────────────────────────────────
  rust: (p) => {

  const { name, params } = parsePythonDef(
    p?.starter_code || ''
  );

  const types = p?.param_types || [];

  const paramList = params
    .map(
      (param, i) =>
        `${param}: ${rustType(types[i] || 'int')}`
    )
    .join(', ');

  const returnType =
    rustType(p?.return_type || 'int');

  return `fn ${name}(${paramList}) -> ${returnType} {

}`;
},

  // ───────────────────────────────────
  // Go
  // Real typed parameters — no interface{} wrappers for user code.
  // The harness injects typed Go literals and marshals the result
  // with encoding/json (stdlib, no external deps).
  // ───────────────────────────────────
 go: (p) => {

  const { name, params } = parsePythonDef(
    p?.starter_code || ''
  );

  const types = p?.param_types || [];

  const paramList = params
    .map(
      (param, i) =>
        `${param} ${goType(types[i] || 'int')}`
    )
    .join(', ');

  const returnType =
    goType(p?.return_type || 'int');

  return `func ${name}(${paramList}) ${returnType} {

}`;
},
};
// ════════════════════════════════════════════════════════════
// Weekly Challenge (organizational grouping — no payment gate)
// ════════════════════════════════════════════════════════════

export type WeeklyChallengeStatus = 'upcoming' | 'active' | 'ended';
export type WeeklyAccessStatus    = 'pending'  | 'confirmed' | 'rejected';

export interface WeeklyChallenge {
  id:          string;
  title:       string;
  description: string;

  // 3 problem IDs included in this week's challenge
  problem_ids: string[];

  // Payment details (kept for legacy — no longer used for access gating)
  entry_fee: number;
  upi_id:    string;
  whatsapp_link: string | null;

  // Week window
  starts_at: string;
  ends_at:   string;

  status: WeeklyChallengeStatus;

  created_at: string;
}

export interface WeeklyAccess {
  id:                    string;
  weekly_challenge_id:   string;
  weekly_challenge_title: string;
  github:                string;
  name:                  string;
  txn_id:                string | null;
  status:                WeeklyAccessStatus;
  created_at:            string;
}

export interface WeeklySubmission {
  id:                  string;
  weekly_challenge_id: string;
  problem_id:          string;
  problem_title:       string;
  github:              string;
  name:                string;
  lang:                string;
  code:                string;
  tests_passed:        number;
  tests_total:         number;
  points_awarded:      number;
  submitted_at:        string;
  created_at:          string;
}

// ════════════════════════════════════════════════════════════
// Subscription (monthly access — ₹39/month, manually renewed)
// ════════════════════════════════════════════════════════════

export type SubscriberStatus = 'pending' | 'confirmed' | 'rejected';

export interface Subscriber {
  id:         string;
  github:     string;
  name:       string;
  txn_id:     string;
  razorpay_order_id?:   string | null;
  razorpay_payment_id?: string | null;
  email?:     string | null;
  email_subscribed?:    boolean;
  status:     SubscriberStatus;
  // ISO timestamp the current paid month runs until. Access is only
  // active while status === 'confirmed' AND this is in the future.
  // Renewing early stacks the extra days on top instead of wasting them.
  current_period_end?: string | null;
  created_at: string;
}

// ════════════════════════════════════════════════════════════
// Contest Feedback (post-contest survey, submitted by users)
// ════════════════════════════════════════════════════════════

export type ContestFeedbackOutcome = 'submitted' | 'disqualified';

export interface ContestFeedback {
  id:              string;
  contest_id:      string;
  contest_name:    string;
  github:          string;
  name:            string;
  outcome:         ContestFeedbackOutcome;
  rating:          number | null;
  difficulty:      'easy' | 'right' | 'hard' | null;
  would_recommend: boolean | null;
  comments:        string | null;
  created_at:      string;
}

// ════════════════════════════════════════════════════════════
// App Config (admin-adjustable key-value settings)
// ════════════════════════════════════════════════════════════

export interface AppConfig {
  key:   string;
  value: string;
}
