# BitByBit — Data Model

> Source of truth: src/types/database.ts for TypeScript types; supabase/migrations/20261001_certificates_schema.sql for DDL. Other tables inferred from query patterns in source code (no additional migrations were found in the repo).

---

## Entity Relationship Diagram

`mermaid
erDiagram
    ADMINS {
        text github PK
    }
    MEMBERS {
        uuid id PK
        text github UK
        text name
        text email
        int total_points
        int problems_solved
        int streak
        timestamptz last_solved_at
        timestamptz created_at
    }
    PROBLEMS {
        uuid id PK
        text title
        text difficulty
        int points
        text[] tags
        text description
        text example
        text starter_code
        text[] param_types
        text return_type
        jsonb test_cases
        text[] hints
        int submission_count
        bool is_contest_problem
        text visibility
        timestamptz created_at
        timestamptz updated_at
    }
    SUBMISSIONS {
        uuid id PK
        uuid problem_id FK
        text problem_title
        text github
        text name
        text lang
        text code
        text approach
        text status
        int tests_passed
        int tests_total
        int points_awarded
        text reject_reason
        timestamptz created_at
    }
    CONTESTS {
        uuid id PK
        text name
        int entry_fee
        int duration_mins
        text upi_id
        int leaderboard_discount
        uuid problem_id FK
        uuid[] problem_ids
        text status
        timestamptz starts_at
        timestamptz created_at
    }
    CONTEST_REGISTRATIONS {
        uuid id PK
        uuid contest_id FK
        text contest_name
        text github
        text name
        text txn_id
        text razorpay_order_id
        text razorpay_payment_id
        text status
        timestamptz created_at
    }
    ARENA_SUBMISSIONS {
        uuid id PK
        uuid contest_id FK
        text contest_name
        uuid problem_id FK
        text problem_title
        text github
        text name
        text lang
        text code
        int strikes
        text status
        float strike_penalty_factor
        int points_awarded
        int tests_passed
        int tests_total
        timestamptz created_at
    }
    SUBSCRIBERS {
        uuid id PK
        text github UK
        text name
        text txn_id
        text razorpay_order_id
        text razorpay_payment_id
        text email
        text status
        timestamptz current_period_end
        timestamptz created_at
    }
    WEEKLY_CHALLENGES {
        uuid id PK
        text title
        text description
        uuid[] problem_ids
        int entry_fee
        text upi_id
        text whatsapp_link
        timestamptz starts_at
        timestamptz ends_at
        text status
        timestamptz created_at
    }
    WEEKLY_ACCESS {
        uuid id PK
        uuid weekly_challenge_id FK
        text weekly_challenge_title
        text github
        text name
        text txn_id
        text status
        timestamptz created_at
    }
    WEEKLY_SUBMISSIONS {
        uuid id PK
        uuid weekly_challenge_id FK
        uuid problem_id FK
        text problem_title
        text github
        text name
        text lang
        text code
        int tests_passed
        int tests_total
        int points_awarded
        timestamptz submitted_at
        timestamptz created_at
    }
    CERTIFICATES {
        uuid id PK
        text certificate_id UK
        uuid member_id FK
        text github
        text recipient_name
        text recipient_email
        text certificate_type
        text title
        text achievement_text
        text event_name
        text organization_text
        text activity_points_text
        jsonb coordinator_names
        timestamptz issued_at
        text issued_by
        text pdf_path
        text status
        text email_status
        text email_error
        timestamptz created_at
        timestamptz updated_at
    }
    EMAIL_LOG {
        uuid id PK
        text github
        text email
        text kind
        text ref_id
        timestamptz sent_at
    }
    AI_USAGE {
        text github
        text action
        int count
        date date
    }
    PRACTICE_ATTEMPTS {
        uuid id PK
        uuid problem_id FK
        text github
        text name
        text lang
        timestamptz attempted_at
    }
    APP_CONFIG {
        text key PK
        text value
    }
    CONTEST_FEEDBACK {
        uuid id PK
        uuid contest_id FK
        text contest_name
        text github
        text name
        text outcome
        int rating
        text difficulty
        bool would_recommend
        text comments
        timestamptz created_at
    }

    MEMBERS ||--o{ SUBMISSIONS : "submits"
    MEMBERS ||--o{ ARENA_SUBMISSIONS : "enters"
    MEMBERS ||--o{ WEEKLY_SUBMISSIONS : "submits"
    MEMBERS ||--o| SUBSCRIBERS : "subscribes"
    MEMBERS ||--o{ CERTIFICATES : "receives"
    PROBLEMS ||--o{ SUBMISSIONS : "solved via"
    PROBLEMS ||--o{ ARENA_SUBMISSIONS : "used in"
    PROBLEMS ||--o{ WEEKLY_SUBMISSIONS : "used in"
    CONTESTS ||--o{ CONTEST_REGISTRATIONS : "has"
    CONTESTS ||--o{ ARENA_SUBMISSIONS : "receives"
    CONTESTS ||--o{ CONTEST_FEEDBACK : "gets"
    WEEKLY_CHALLENGES ||--o{ WEEKLY_ACCESS : "gated by"
    WEEKLY_CHALLENGES ||--o{ WEEKLY_SUBMISSIONS : "receives"
`

---

## Table Definitions

### admins

| Column | Type | Notes |
|---|---|---|
| github | TEXT PRIMARY KEY | GitHub username of admin |

Used by all admin routes as the authorization gate.

---

### members

| Column | Type | Notes |
|---|---|---|
| id | UUID | Auto-generated |
| github | TEXT UNIQUE | GitHub username (identity key) |
| name | TEXT | Full name from GitHub |
| email | TEXT NULLABLE | Populated by /api/auth/sync |
| email_subscribed | BOOL | Default true; opt-out flag for promotional emails |
| total_points | INT | Sum of points_awarded from all approved submissions |
| problems_solved | INT | Count of distinct problems with approved submission |
| streak | INT | Consecutive-day solve count |
| last_solved_at | TIMESTAMPTZ | Updated on every successful submit |
| created_at | TIMESTAMPTZ | Row creation |

**Note**: 	otal_points and problems_solved are maintained client-side by syncMemberProgress() in Workspace.tsx:103-138. They are **denormalized counters** — the canonical scores are computed on-demand in LeaderboardPage.tsx.

---

### problems

| Column | Type | Notes |
|---|---|---|
| id | UUID | Auto-generated |
| 	itle | TEXT | Problem title |
| difficulty | TEXT | 'Easy' or 'Medium' or 'Hard' |
| points | INT | Maximum points for this problem |
| 	ags | TEXT[] | e.g. ['arrays', 'two-pointer'] |
| description | TEXT | HTML content (admin-authored, sanitized by DOMPurify on render) |
| example | TEXT | Example I/O |
| starter_code | TEXT | Python def signature |
| param_types | TEXT[] | JSON type strings for each param |
| eturn_type | TEXT | JSON type string for return value |
| 	est_cases | JSONB | Array of {input, expected} — all cases used for grading |
| hints | TEXT[] | Optional hint strings |
| submission_count | INT | Denormalized counter |
| is_contest_problem | BOOL | Flag; used for filtering |
| isibility | TEXT | 'public' or 'arena' or 'weekly' |

**Critical note on hidden test cases**: There is **no separate hidden_test_cases column**. All 	est_cases are in one array. The client controls how many to display. This means all test case inputs/expected outputs are available to the browser if the client code is inspected.

---

### submissions

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| problem_id | UUID | FK to problems |
| problem_title | TEXT | Denormalized for display |
| github | TEXT | Submitter |
| 
ame | TEXT | Denormalized |
| lang | TEXT | SupportedLang |
| code | TEXT | Full submitted code |
| pproach | TEXT | Approach description (required for non-arena, non-weekly) |
| status | TEXT | 'pending' or 'approved' or 'rejected' |
| 	ests_passed | INT | |
| 	ests_total | INT | |
| points_awarded | INT | floor(problem.points * passed/total) |
| eject_reason | TEXT NULLABLE | Admin-set on rejection |
| created_at | TIMESTAMPTZ | |

**Unique constraint**: (problem_id, github) — one row per user per problem (UPSERT pattern)

---

### contests

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| 
ame | TEXT | |
| entry_fee | INT | Legacy; not collected via Razorpay (Razorpay restriction) |
| duration_mins | INT | Contest duration |
| upi_id | TEXT | Legacy UPI reference |
| leaderboard_discount | INT | Discount percentage field (NOT FOUND IN CODE as active logic) |
| problem_id | UUID NULLABLE | Single-problem contests (legacy) |
| problem_ids | UUID[] | Multi-problem contests |
| status | TEXT | 'upcoming' or 'live' or 'ended' |
| starts_at | TIMESTAMPTZ | When contest goes live (countdown triggers from this) |
| created_at | TIMESTAMPTZ | |

---

### contest_registrations

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| contest_id | UUID | FK to contests |
| contest_name | TEXT | Denormalized |
| github | TEXT | |
| 
ame | TEXT | |
| 	xn_id | TEXT NULLABLE | Legacy; null for subscription-based entry |
| azorpay_order_id | TEXT NULLABLE | null for free subscriber entry |
| azorpay_payment_id | TEXT NULLABLE | null for free subscriber entry |
| status | TEXT | 'pending' or 'confirmed' or 'rejected' |
| created_at | TIMESTAMPTZ | |

**Unique constraint**: (contest_id, github)

---

### arena_submissions

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| contest_id | UUID NULLABLE | |
| contest_name | TEXT | |
| problem_id | UUID NULLABLE | |
| problem_title | TEXT | |
| github | TEXT | |
| 
ame | TEXT | |
| lang | TEXT | |
| code | TEXT | |
| strikes | INT | Tab-switch / fullscreen violations at submit time |
| status | TEXT | 'submitted' or 'disqualified' or 'reviewed' |
| strike_penalty_factor | FLOAT | timeFactor * strikePenalty; applied by admin during review |
| points_awarded | INT | Set by admin during review |
| 	ests_passed | INT | From auto-test at submit time |
| 	ests_total | INT | |
| created_at | TIMESTAMPTZ | |

**Unique constraint**: (contest_id, problem_id, github) (UPSERT on re-submit)

---

### subscribers

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| github | TEXT UNIQUE | |
| 
ame | TEXT | |
| 	xn_id | TEXT | Legacy UPI reference |
| azorpay_order_id | TEXT NULLABLE | |
| azorpay_payment_id | TEXT NULLABLE | |
| email | TEXT NULLABLE | From auth/sync |
| email_subscribed | BOOL | Default true; opt-out flag for promotional emails |
| status | TEXT | 'pending' or 'confirmed' or 'rejected' |
| current_period_end | TIMESTAMPTZ NULLABLE | Access active while status='confirmed' AND this > now() |
| created_at | TIMESTAMPTZ | |

---

### email_unsubscribes

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | TEXT UNIQUE | Unsubscribed email address |
| reason | TEXT NULLABLE | Optional reason / feedback provided |
| source | TEXT | 'web_page', 'direct_link', or 'api' |
| unsubscribed_at | TIMESTAMPTZ | Timestamp of opt-out request |
| created_at | TIMESTAMPTZ | Row creation |

**Active subscription check** (src/lib/subscription.ts:isActiveSubscription):
`
status === 'confirmed' AND current_period_end > now()
`

---

### weekly_challenges

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| 	itle | TEXT | |
| description | TEXT | |
| problem_ids | UUID[] | 3 problem IDs |
| entry_fee | INT | Legacy; access is now subscription-gated |
| upi_id | TEXT | Legacy |
| whatsapp_link | TEXT NULLABLE | WhatsApp group invite link |
| starts_at / ends_at | TIMESTAMPTZ | Challenge window |
| status | TEXT | 'upcoming' or 'active' or 'ended' |
| created_at | TIMESTAMPTZ | |

---

### weekly_access

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| weekly_challenge_id | UUID | FK |
| weekly_challenge_title | TEXT | Denormalized |
| github | TEXT | |
| 
ame | TEXT | |
| 	xn_id | TEXT NULLABLE | Legacy UPI reference |
| status | TEXT | 'pending' or 'confirmed' or 'rejected' |
| created_at | TIMESTAMPTZ | |

---

### weekly_submissions

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| weekly_challenge_id | UUID | FK |
| problem_id | UUID | FK |
| problem_title | TEXT | Denormalized |
| github | TEXT | |
| 
ame | TEXT | |
| lang | TEXT | |
| code | TEXT | |
| 	ests_passed | INT | |
| 	ests_total | INT | |
| points_awarded | INT | |
| submitted_at | TIMESTAMPTZ | Used for leaderboard tiebreaking (first solve wins) |
| created_at | TIMESTAMPTZ | |

---

### certificates

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| certificate_id | TEXT UNIQUE | Human-readable ID used in QR URL |
| member_id | UUID FK NULLABLE | FK to members |
| github | TEXT | |
| ecipient_name | TEXT | |
| ecipient_email | TEXT | |
| certificate_type | TEXT | Default 'Certificate of Achievement' |
| 	itle | TEXT | Default 'CERTIFICATE OF ACHIEVEMENT' |
| chievement_text | TEXT | Custom achievement description |
| event_name | TEXT | |
| organization_text | TEXT | |
| ctivity_points_text | TEXT NULLABLE | |
| coordinator_names | JSONB | Array of {name, title, org} |
| issued_at | TIMESTAMPTZ | |
| issued_by | TEXT | Admin GitHub handle |
| pdf_path | TEXT | Storage path |
| status | TEXT | 'issued' or 'revoked' |
| email_status | TEXT | 'pending' or 'sent' or 'failed' |
| email_error | TEXT NULLABLE | Error message if send failed |
| created_at / updated_at | TIMESTAMPTZ | |

---

### email_log

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| github | TEXT | Recipient's GitHub handle |
| email | TEXT | Recipient email address |
| kind | TEXT | 'subscription_confirmed', 'contest_live', 'weekly_challenge', 'subscribe_nudge', 'inactivity_nudge' |
| ef_id | TEXT | Context-specific dedup key |
| sent_at | TIMESTAMPTZ | |

**Unique constraint**: (github, kind, ref_id)

**Retention**: pruned after 180 days by /api/admin/prune

---

### ai_usage

| Column | Type | Notes |
|---|---|---|
| github | TEXT | |
| ction | TEXT | 'hint', 'explain', 'review', 'editorial', 'approach' |
| count | INT | Daily call count |
| date | DATE | UTC date |

**Retention**: pruned after 90 days by /api/admin/prune

---

### practice_attempts

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| problem_id | UUID | |
| github | TEXT | |
| 
ame | TEXT | |
| lang | TEXT | |
| ttempted_at | TIMESTAMPTZ | |

**Unique constraint**: (problem_id, github) — upserted with ignoreDuplicates: true

**Retention**: pruned after 60 days by /api/admin/prune

---

### app_config

| Column | Type | Notes |
|---|---|---|
| key | TEXT PRIMARY KEY | e.g. 'subscription_amount_paise' |
| alue | TEXT | e.g. '3900' |

Used by create-order to fetch payment amount server-side.

---

### contest_feedback

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| contest_id | UUID | |
| contest_name | TEXT | |
| github | TEXT | |
| 
ame | TEXT | |
| outcome | TEXT | 'submitted' or 'disqualified' |
| ating | INT NULLABLE | |
| difficulty | TEXT NULLABLE | 'easy' or 'right' or 'hard' |
| would_recommend | BOOL NULLABLE | |
| comments | TEXT NULLABLE | |
| created_at | TIMESTAMPTZ | |

---

## Row Level Security (RLS) Summary

Only the certificates migration is tracked in the repo. All other RLS policies are inferred from the code patterns:

| Table | RLS pattern inferred from code |
|---|---|
| members | Service-role writes in auth/sync (bypasses RLS for first-time creation) |
| dmins | Service-role reads only (checked in every admin route) |
| problems | Public SELECT; service-role writes in admin panel |
| submissions | Public SELECT by user (anon client); service-role writes |
| subscribers | Service-role reads/writes in payment routes |
| certificates | See migration: anon SELECT all; auth SELECT own + admin all; admin INSERT/UPDATE |
| contest_registrations | Service-role writes; user reads own rows |
| rena_submissions | Service-role writes; anon reads for leaderboard |
| email_log | Service-role only |
| i_usage | Service-role reads/writes via /api/ai |

**Important**: The code frequently uses createServerSupabaseClient() (service-role key) to bypass RLS entirely in server-side API routes. RLS is primarily a defense against direct Supabase JS client requests from the browser.
