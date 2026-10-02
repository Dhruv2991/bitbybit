# BitByBit — System Architecture

> All claims cite file paths and function/line references.

---

## 1. High-Level Architecture

`mermaid
flowchart TD
    Browser["Browser (React / Next.js Client)"]
    NextJS["Next.js 14 Server (Vercel Serverless)"]
    SupaAuth["Supabase Auth (GitHub OAuth)"]
    SupaDB["Supabase Postgres (RLS enforced)"]
    SupaRT["Supabase Realtime"]
    Razorpay["Razorpay (payments)"]
    Brevo["Brevo (transactional email)"]
    Groq["Groq API (LLM)"]
    Ollama["Ollama (LLM fallback)"]
    Judge0["Judge0 (code execution)"]
    Wandbox["Wandbox (code execution fallback)"]
    Pyodide["Pyodide WASM (browser Python)"]
    WebWorker["Web Worker (browser JS)"]

    Browser -- "GitHub OAuth PKCE" --> SupaAuth
    Browser -- "Anon JWT API calls" --> NextJS
    Browser -- "Supabase JS client (anon key)" --> SupaDB
    Browser -- "Realtime subscriptions" --> SupaRT
    Browser -- "Python/JS code" --> Pyodide
    Browser -- "JS code" --> WebWorker
    NextJS -- "Service-role key" --> SupaDB
    NextJS -- "HMAC verify + SDK" --> Razorpay
    NextJS -- "REST" --> Brevo
    NextJS -- "REST" --> Groq
    NextJS -- "REST fallback" --> Ollama
    NextJS -- "REST" --> Judge0
    NextJS -- "REST fallback" --> Wandbox
    Razorpay -- "Webhook POST" --> NextJS
`

---

## 2. Request Lifecycle — Typical API Call

All sensitive API routes follow this pattern (verified across 8+ routes):

`mermaid
sequenceDiagram
    participant C as Browser
    participant N as Next.js API Route
    participant SA as Supabase Auth
    participant DB as Supabase DB (service role)

    C->>N: POST /api/* with Authorization: Bearer {JWT}
    N->>SA: supabase.auth.getUser(token) [anon key]
    SA-->>N: { user } or error
    N->>DB: .from('admins').select().eq('github', username)
    DB-->>N: admin row or null
    N->>DB: Business logic query (service-role key)
    DB-->>N: Results
    N-->>C: JSON response
`

*Source*: pi/notify/broadcast/route.ts:32-50, pi/admin/backfill-emails/route.ts:24-42

---

## 3. Authentication & Session Flow

`mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant SA as Supabase Auth
    participant API as /api/auth/sync

    U->>B: Click "Sign in with GitHub"
    B->>SA: signInWithOAuth({ provider: 'github', flowType: 'implicit' })
    SA-->>B: Redirect to GitHub OAuth
    B->>SA: OAuth callback with code
    SA-->>B: Session (access_token JWT in localStorage)
    B->>API: POST /api/auth/sync { Authorization: Bearer JWT }
    API->>SA: getUser(JWT) — validate token
    SA-->>API: { user_metadata.user_name, email }
    API->>DB: UPSERT members (github, name, email) [service-role key]
    DB-->>API: OK
    API-->>B: { ok: true }
`

*Source*: src/lib/supabase.ts:22 (flowType), src/app/api/auth/sync/route.ts:1-110

### Why service-role key in sync?

The members table RLS policy blocks anon/authed writes unless the user row already exists. A first-time GitHub login has no row — the service-role key bypasses RLS to create it. Explained in uth/sync/route.ts:1-20 comments.

---

## 4. Code Execution Pipeline

`mermaid
flowchart TD
    subgraph Browser
        LT["Lang selection\n(browserExecutor.getStrategy)"]
        PY["Python → Pyodide WASM\nrunInBrowser"]
        JS["JavaScript → Web Worker\nrunInBrowser"]
    end
    subgraph Server ["Next.js API /api/execute"]
        EX["executor.ts: buildHarness → batchSubmit"]
        J0["Judge0 (JUDGE0_URL)\nbatchSubmit → polling"]
        WB["Wandbox fallback\n3 retries, 10s timeout"]
    end

    LT -->|python/js| PY & JS
    LT -->|cpp/java/rust/go| Server
    EX --> J0
    J0 -->|unreachable / error| WB
`

**Strategy router** (src/lib/browserExecutor.ts:158-166):
`
python | javascript → browser
cpp | java | rust | go → server
`

**Server harness** (src/lib/executor.ts): wraps user function with a main that calls it on each test-case input, compares stdout to expected output. Supports 6 language harness templates (Lines 1-590).

**Judge0 polling** (src/lib/executor.ts:638-693): submits batch, polls every 1.5s with up to 15 retries, falls back to Wandbox on any failure.

---

## 5. Payment Flow

`mermaid
sequenceDiagram
    participant C as Browser
    participant CO as /api/razorpay/create-order
    participant VE as /api/razorpay/verify
    participant WH as /api/razorpay/webhook
    participant RZ as Razorpay
    participant DB as Supabase DB

    C->>CO: POST { Authorization: Bearer JWT }
    CO->>DB: SELECT amount FROM app_config (service-role)
    CO->>RZ: razorpay.orders.create({ amount, currency: INR })
    RZ-->>CO: { orderId }
    CO-->>C: { orderId, amount, key }
    C->>RZ: Razorpay Checkout JS (browser)
    RZ-->>C: Payment success { paymentId, orderId, signature }
    C->>VE: POST { paymentId, orderId, signature, Authorization: JWT }
    VE->>VE: HMAC-SHA256(orderId+|+paymentId, secret) == signature?
    VE->>RZ: razorpay.payments.fetch(paymentId) [server re-fetch]
    VE->>DB: UPSERT subscribers (github, status='active', ...) [service-role]
    VE->>DB: UPSERT email_log (dedup) [service-role]
    VE-->>C: { success: true }
    RZ-->>WH: Webhook POST (payment.captured)
    WH->>WH: validateWebhookSignature(body, sig, secret)
    WH->>DB: UPSERT subscribers (idempotent) [service-role]
`

*Sources*: pi/razorpay/create-order/route.ts, pi/razorpay/verify/route.ts, pi/razorpay/webhook/route.ts

**Key security decisions**:
- Amount never comes from request body; fetched from pp_config DB table (create-order/route.ts:72-80)
- Signature verification done with 	imingSafeEqual equivalent pattern (erify/route.ts:77-88)
- Razorpay server re-fetch confirms payment status before writing subscriber (erify/route.ts:94-105)
- Idempotency: check azorpay_payment_id before UPSERT (erify/route.ts:107-115)
- Webhook is a belt-and-suspenders backup; primary flow is erify

---

## 6. AI Request Pipeline

`mermaid
sequenceDiagram
    participant C as Browser (gemini.ts)
    participant LS as localStorage cache
    participant SB as Supabase ai_usage
    participant API as /api/ai
    participant GR as Groq
    participant OL as Ollama (fallback)

    C->>LS: Check usage (limit not exceeded?)
    C->>SB: refreshUsageFromServer() — sync daily counts
    C->>API: POST { action, prompt, model }
    API->>GR: groq.chat.completions.create(...)
    GR-->>API: text response (or rate limit error)
    API->>OL: fallback if Groq fails
    OL-->>API: text response
    API-->>C: { result }
    C->>LS: update usage counts
    C->>SB: upsert ai_usage (github, action, count, date)
`

*Source*: src/lib/gemini.ts, src/app/api/ai/route.ts

**Limit tiers** (from gemini.ts:106-141):
- Free user: daily limits for hints, reviews, explanations
- Subscriber: higher limits
- Admin: unlimited (bypasses all limits)

---

## 7. Supabase Realtime

Arena page subscribes to contests table changes for live status updates:

`	ypescript
// ArenaPage.tsx:60-64
db.channel('arena-contests-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => loadContests())
  .subscribe();
`

This triggers a full loadContests() re-fetch (not a delta) whenever any contest row changes.

---

## 8. Email Deduplication Architecture

All email sends follow a log-then-skip pattern:

`mermaid
flowchart TD
    A["Candidate recipient list"] --> B{"Is github in email_log\n(kind, ref_id)?"}
    B -->|Yes| C["Skip (already sent)"]
    B -->|No| D["Send email via Brevo"]
    D --> E{"Send succeeded?"}
    E -->|Yes| F["UPSERT email_log\n(github, kind, ref_id)"]
    E -->|No| G["Skip log entry\n(will retry next run)"]
`

ef_id encodes the context:
- subscription_confirmed: Razorpay paymentId (erify/route.ts:169)
- contest_live / weekly_challenge: contest/challenge UUID (roadcast/route.ts:100-101)
- subscribe_nudge / inactivity_nudge: YYYY-MM string (subscribe-nudge/route.ts:87)

---

## 9. Leaderboard Score Aggregation

Client-side aggregation across 3 submission tables (LeaderboardPage.tsx:63-103):

`
For each github+problem_id key across submissions + arena_submissions + weekly_submissions:
  keep only the highest points_awarded (prevents double-counting)
Sum per-user totals → sort descending → top 100
`

Weekly/monthly tabs apply a date filter to created_at (submissions) or submitted_at (weekly_submissions) before the same aggregation.

---

## 10. Security Headers (next.config.mjs)

| Header | Value |
|---|---|
| Content-Security-Policy | See below |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |

**CSP note** (
ext.config.mjs:59): unsafe-inline and unsafe-eval are present in script-src because Monaco Editor and Pyodide both require dynamic code evaluation. This is a known trade-off documented in the config.
