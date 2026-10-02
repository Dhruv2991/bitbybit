# BitByBit — Interview Preparation Guide

> Answers to the questions a senior/staff engineer interviewer is most likely to ask about this codebase.

---

## System Design Questions

### "Walk me through the architecture of BitByBit."

BitByBit is a Next.js 14 full-stack app deployed on Vercel. The frontend is React with Tailwind. The backend is a set of serverless API routes. Data lives in Supabase Postgres with Row Level Security. Auth is GitHub OAuth via Supabase Auth.

The three most interesting subsystems are:

1. **Code execution**: Python and JS run in the browser (Pyodide WASM + Web Workers) to eliminate server cost and cold starts. C++, Java, Rust, Go route to a self-hosted Judge0 instance with Wandbox as a fallback. The strategy is selected in src/lib/browserExecutor.ts:158-166.

2. **Payments**: Razorpay integration for a Rs39/month subscription. The amount is always read server-side from an pp_config DB table (never from request body). Verification uses HMAC-SHA256 signature checking plus a server-side payment re-fetch from Razorpay's API before activating a subscription.

3. **AI features**: A 5-action AI system (hints, failure explanation, code review, editorial, approach validation) that uses Groq (llama-3.3-70b) with Ollama as a self-hosted fallback. Limits are tracked in Supabase i_usage and mirrored to localStorage. The tier system (free/subscriber/admin) is enforced client-side with server-side DB sync to prevent localStorage clearing.

---

### "How does authentication work? How do you derive and verify caller identity?"

All auth is GitHub OAuth through Supabase's implicit flow. Users get a JWT on sign-in.

On the client: getSupabaseClient() is a singleton that holds the session (src/lib/supabase.ts).

On the server: Every API route that needs identity does this exact pattern:
`	ypescript
const token = req.headers.get('authorization')?.slice(7);
const { data: { user } } = await supabaseAnonClient.auth.getUser(token);
const github = user.user_metadata?.user_name;
`

The github handle is extracted from JWT claims — it never comes from the request body. This is the critical security property cited in contest/register/route.ts:13.

Admin verification adds a second step: check the dmins table for a row with github = extracted_handle.

The one subtle case is /api/auth/sync: first-time GitHub logins have no row in members (RLS blocks writes), so this route uses the service-role key to bypass RLS and create the member row.

---

### "Explain the payment flow. How do you prevent price manipulation?"

Three-phase payment:

1. **Order creation** (/api/razorpay/create-order): Server reads subscription_amount_paise from pp_config table. Creates Razorpay order server-side. Returns orderId + mount to client. The client never supplies the amount — it's always DB-sourced.

2. **Checkout** (browser): Razorpay JS SDK handles the payment UI using our key and the orderId. On success, Razorpay returns {paymentId, orderId, signature} to the callback.

3. **Verification** (/api/razorpay/verify): 
   - Verify HMAC-SHA256 signature: sha256(orderId + '|' + paymentId, RAZORPAY_KEY_SECRET) === signature
   - Re-fetch payment from Razorpay API to confirm captured status
   - Check idempotency: if azorpay_payment_id already in subscribers, skip
   - UPSERT subscriber record, extending current_period_end by 30 days

The webhook at /api/razorpay/webhook is a belt-and-suspenders backup that handles the same UPSERT idempotently.

---

### "How does the Arena proctoring system work?"

When a user enters a contest:
1. document.documentElement.requestFullscreen() is called
2. Two event listeners are attached:
   - ullscreenchange: if user exits fullscreen, strike++ and show blocking overlay
   - isibilitychange: if tab is hidden (not caused by fullscreen exit), strike++ and toast warning
3. A 1-second countdown timer starts

A sJustChanged boolean prevents double-counting when fullscreen exit and visibilitychange fire simultaneously (browser behavior).

At 3 strikes, endContest('disqualified') is called, which removes both event listeners and inserts a disqualified row into rena_submissions.

Scoring combines a time factor (1.0 → 0.5 based on elapsed time) and a strike penalty (1.0 → 0.7 based on strikes). The admin reviews submitted code and manually sets final points_awarded.

**Limitation**: Client-side proctoring is bypassable by disabling JavaScript or using a VM. For a college club context, this is an acceptable trade-off vs. the infrastructure cost of a server-side proctoring solution.

---

### "How does the leaderboard work? Can a user's score be double-counted?"

The overall leaderboard aggregates from 3 tables: submissions, rena_submissions, weekly_submissions. The dedup logic in LeaderboardPage.tsx:70-85 groups by (github, problem_id) and keeps the highest points_awarded per pair. This prevents a user from getting credit for the same problem in both a contest and normal practice.

Weekly/monthly tabs apply a date cutoff but do NOT deduplicate across tables — a known limitation where solving the same problem in both a contest and as a normal submission in the same week counts twice.

The leaderboard is computed client-side by fetching up to 5000 rows per table. At current club scale this is fine; at larger scale, you'd push this into a Postgres function and cache the result.

---

### "What's the subscription model? How do renewals work?"

Rs39/month, manually renewed (not auto-recurring). A subscriber's access is defined by:
- status = 'confirmed' AND current_period_end > now()

On renewal, computeNewPeriodEnd() in src/lib/subscription.ts adds 30 days to the **later of** today or the existing current_period_end. This means renewing early doesn't waste days.

Contest entry is free for active subscribers — Razorpay is only used for the subscription itself (per a business restriction noted in contest/register/route.ts:6-11).

---

## Technical Deep-Dive Questions

### "Why is Python executed in the browser instead of on the server?"

Three reasons:

1. **No server cost**: Pyodide runs as WASM in the browser. Zero compute cost per Python execution.
2. **No cold starts**: Once Pyodide loads (~15MB from CDN, cached after first run), subsequent executions are instant.
3. **Sandboxing**: WASM is naturally sandboxed. No need to manage Docker containers or seccomp rules.

The trade-off is the ~5 second first-run latency while Pyodide loads from CDN. This is shown as a loading state: "Loading Python… (first run ~5s)" (Workspace.tsx:944).

---

### "How does auto-grading work? When is it triggered vs manual review?"

canAutoGrade = total > 0 (Workspace.tsx:1036).

If the problem has test cases, the submission gets auto-graded:
- status = 'approved' immediately
- points_awarded = floor(problem.points * passed/total)
- syncMemberProgress() is called to update streak, total_points, problems_solved
- Resubmission keeps the max score (never lowers)

If the problem has no test cases, it goes to status = 'pending' for manual admin review.

---

### "How is email deduplication implemented?"

All email kinds use the email_log table with a unique constraint on (github, kind, ref_id).

The pattern: send first, only write to email_log if the send succeeds. Failed sends are not logged — they're retried automatically on the next cron run or admin click.

ef_id encodes the idempotency context:
- Subscription emails: Razorpay paymentId
- Contest broadcasts: contest UUID
- Monthly nudges: YYYY-MM string

---

### "What are the biggest architectural weaknesses?"

Honest answer with code evidence:

1. **Hidden test cases aren't actually hidden** (database.ts:36): All test cases — including ones labeled "hidden" — are in a single 	est_cases JSONB column loaded into the browser. Anyone who inspects their browser's memory can read every expected output.

2. **AI limits are client-enforced** (gemini.ts): The /api/ai route has no server-side rate limiting. A user who bypasses gemini.ts and calls /api/ai directly can exhaust Groq's free-tier quota.

3. **Leaderboard is client-computed** (LeaderboardPage.tsx:63): Fetches up to 5000 rows per table, aggregates in JavaScript. Breaks at scale and produces incorrect rankings once the hard limit is hit.

4. **Admin check is a 2-step DB round-trip** (all admin routes): Auth token verification + dmins table check are separate calls. No TOCTOU in practice, but architecturally fragile vs. the is_admin() function approach in the certificates RLS.

---

## Behavioral Questions

### "Tell me about a tricky bug you'd fix first in this codebase."

The CRON_SECRET debug log in dmin/prune/route.ts:61. It's the first thing I'd remove. It logs the secret length and the match boolean to Vercel server logs on every weekly cron invocation. Any log aggregation tool (Datadog, Logtail, Sentry) would capture this. The comment even says "TEMP DEBUG — remove after confirming" — it just hasn't been removed.

### "What would you add next if you had two weeks?"

**Server-side grading for hidden test cases**: Currently all test cases are visible to the browser. I'd split 	est_cases into sample_cases (for the editor) and judge_cases (server-only). The /api/execute route would run code against judge_cases and return a verdict, not the cases themselves.

**Server-side AI rate limiting**: Move usage enforcement to /api/ai. Atomic UPDATE ai_usage SET count = count + 1 WHERE count < limit in a single DB call. Client localStorage becomes a UI optimization only, not a security gate.
