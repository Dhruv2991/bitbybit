# BitByBit — Deep Dives

> Detailed walkthroughs of the six most complex subsystems. All citations reference actual code.

---

## Deep Dive 1: Code Execution Pipeline

### Overview

Two execution paths exist, selected by language:

| Language | Strategy | Engine |
|---|---|---|
| Python | Browser | Pyodide 0.26.1 (WASM, loaded from CDN) |
| JavaScript | Browser | Web Worker (5s timeout) |
| C++ | Server | Judge0 → Wandbox fallback |
| Java | Server | Judge0 → Wandbox fallback |
| Rust | Server | Judge0 → Wandbox fallback |
| Go | Server | Judge0 → Wandbox fallback |

*Source*: src/lib/browserExecutor.ts:158-166 (getStrategy)

### Browser Execution — Python (Pyodide)

**File**: src/lib/browserExecutor.ts

`
1. Load pyodide.js from CDN (deferred until first Python run)
2. Initialize with packages=[] (stdlib only)
3. For each test case:
   a. Reset stdout buffer
   b. Create exec harness that calls solution(args...) and prints result
   c. pyodide.runPythonAsync(harness)
   d. Compare stdout to expected
4. Aggregate pass/fail results
`

The harness wraps user code in a try-except to catch runtime errors and include them in the result. Test cases run sequentially (not parallel) to avoid Pyodide state bleed.

**Timeouts**: Each test has a 10s client-side timeout implemented with Promise.race.

### Browser Execution — JavaScript (Web Worker)

A Web Worker receives the user function code + test inputs, calls the function, and postMessages results back. A 5s timeout kills the worker if it doesn't respond. This prevents infinite loops from blocking the main thread.

### Server Execution — Judge0

**File**: src/lib/executor.ts

**Harness building** (Lines 1-590): For each target language, uildHarness(lang, code, testCases) generates a complete runnable program:
- User function is embedded verbatim
- A main function iterates test cases, parsing JSON input via the language's JSON library
- Each case's output is printed on a new line for easy parsing
- Return types are serialized back to JSON for comparison

**Batch submission** (executor.ts:638-693):
1. POST /submissions/batch to Judge0 with all test cases
2. Poll /submissions/batch with tokens every 1.5s
3. Up to 15 polling attempts (22.5s max wait)
4. On failure or Judge0 unreachable: fall back to Wandbox

**Wandbox fallback** (executor.ts:591-637):
- Submits one test case at a time to https://wandbox.org/api/compile.json
- 3 retries per test case with 10s timeout
- Slower but free and has no rate limits

### Test Result Comparison

Both paths normalize outputs before comparison:
- Strip trailing whitespace/newlines
- Parse as JSON when both sides look like valid JSON (handles 	rue/True differences)
- Fall back to string comparison

---

## Deep Dive 2: AI Features (gemini.ts)

### Architecture

`
Client (gemini.ts)
├── Usage tracking (localStorage + Supabase ai_usage sync)
├── Limit enforcement (free vs subscriber vs admin tiers)
├── Hint cooldown (30s between consecutive hints per problem)
└── API call → POST /api/ai → Groq → Ollama fallback
`

**File**: src/lib/gemini.ts

### 5 AI Actions

| Action | Function | Description | UI Location |
|---|---|---|---|
| hint | getAiHint | Progressive hints (up to limit per problem) | Left panel, AI Hints section |
| explain | explainFailure | 3-part root cause analysis of test failures | Test Results panel |
| eview | eviewCode | Complexity + quality + alternative approach | AI Code Review panel |
| editorial | generateEditorial | Full editorial with Python + JS solutions | Editorial tab |
| pproach | alidateApproach | Pre-code approach correctness check | Approach text input |

### Usage Limits

Limits are enforced client-side and synced with Supabase. Two tiers:
- **Free**: Lower daily counts for each action
- **Subscriber**: Higher daily counts
- **Admin**: used >= 9999 check always passes; effectively unlimited

Daily counts reset at midnight (UTC). i_usage table stores (github, action, count, date).

**Server sync** (efreshUsageFromServer): Called on page load and after each AI action. Fetches today's row from i_usage and overwrites localStorage. Prevents users from deleting localStorage to bypass limits.

### Hint Cooldown

After each hint, a 30-second cooldown prevents rapid-fire consumption. Tracked client-side in Workspace.tsx state (hintCooldownSecs). The cooldown does not persist across page reloads.

### Groq → Ollama Fallback

`	ypescript
// gemini.ts:259-282 (conceptual)
try {
  response = await callGroq(prompt, model);
} catch (groqError) {
  if (OLLAMA_URL) response = await callOllama(prompt, OLLAMA_MODEL);
  else throw groqError;
}
`

Groq model: llama-3.3-70b-versatile (from GROQ_MODEL env, defaults to this model).
Ollama model: qwen2.5-coder:3b (from NEXT_PUBLIC_OLLAMA_MODEL env).

### localStorage Cache

AI responses for editorial are cached in localStorage under b_editorial_{problemId}. On next open, if a cached response exists, it's shown immediately without an API call.

---

## Deep Dive 3: Arena (Proctored Contest System)

### Contest Lifecycle

`
upcoming → live → ended
`

Admin changes status in the DB. Realtime subscription in ArenaPage triggers loadContests() on any contests table change (ArenaPage.tsx:60-65).

### Entry Flow

1. User clicks "Enter Contest" — see startContest() (ArenaPage.tsx:157-173)
2. Must have confirmed registration (from /api/contest/register)
3. Rules modal shown (setRulesContest(contest))
4. User confirms → enterContestNow() → fullscreen requested

### Proctoring

**Fullscreen enforcement** (ArenaPage.tsx:195-211):
`
document.addEventListener('fullscreenchange', fsHandler)
  → on exit: strike++; if strikes >= 3: disqualify
  → on re-enter: hide overlay
`

**Tab-switch detection** (ArenaPage.tsx:213-223):
`
document.addEventListener('visibilitychange', visHandler)
  → document.hidden && !fsJustChanged: strike++; toast warning
  → fsJustChanged flag prevents double-strike on simultaneous fullscreen+visibility events
`

Both handlers are cleaned up in endContest() to prevent memory leaks.

### Scoring Formula

**Time factor** (ArenaPage.tsx:243):
`
elapsed = duration_mins * 60 - timeLeft
timeFactor = max(0.5, 1 - (elapsed / totalTime) * 0.5)
`
→ Submitting at start of contest: timeFactor = 1.0
→ Submitting at very end: timeFactor = 0.5

**Strike penalty** (ArenaPage.tsx:297):
`
strikePenalty = max(0.7, 1 - strikes * 0.1)
`
→ 0 strikes: penalty = 1.0
→ 1 strike: penalty = 0.9
→ 2 strikes: penalty = 0.8
→ 3 strikes: disqualified

**Combined**: strike_penalty_factor = timeFactor * strikePenalty stored in rena_submissions.

Admin manually sets final points_awarded using this factor. Formula shown in AdminPage.tsx:1031:
`
floor(problem.points * tests_passed/tests_total * strike_penalty_factor)
`

### Auto-Submission on Timer Expiry

When timer hits 0, ecordTimerExpirySub() fires (ArenaPage.tsx:235-253). It records whatever state the user is at with code = '-- Time expired before submission --' and points_awarded = 0. This gives the admin a record of the attempt.

### Draft Persistence

Arena drafts are scoped by (contestId, problemId, lang) to avoid collisions with practice drafts. They're cleared after submission or contest end (ArenaPage.tsx:340+).

---

## Deep Dive 4: Subscription & Payment System

### Subscription Lifecycle

`
User pays → /api/razorpay/verify → subscribers.status = 'confirmed'
             & current_period_end = now() + 30 days
             
Renewal → same route → current_period_end = max(existing_end, today) + 30 days
`

computeNewPeriodEnd() in src/lib/subscription.ts: if the current period hasn't expired yet, stacks 30 days on top of it (no wasted days). If expired, computes from today.

### isActiveSubscription

`	ypescript
// src/lib/subscription.ts
function isActiveSubscription(status, current_period_end): boolean {
  return status === 'confirmed' && !!current_period_end && new Date(current_period_end) > new Date();
}
`

This is called in 8+ places: contest/register, ArenaPage, Workspace, WeeklyChallengePage, etc.

### What Subscription Unlocks (from code)

| Feature | Gate location |
|---|---|
| Solve problems (regular) | Workspace.tsx:788-804 (subscriber check for AI) |
| Weekly challenge access | WeeklyChallengePage.tsx |
| Arena contest entry | contest/register/route.ts:70-75 |
| AI hints/review/editorial | gemini.ts limit tiers |
| Logic Visualizer | Workspace.tsx:708 → checkVisualizerAccess |
| Receive broadcast emails | 
otify/broadcast/route.ts:75-76 |

### Razorpay Restriction

Comment in contest/register/route.ts:6-11 explicitly states:
> "Arena contest entry is FREE for confirmed subscribers — no payment is collected for contest entry at all (per Razorpay's unregistered-business restriction: only the monthly subscription fee may be collected)"

---

## Deep Dive 5: Leaderboard Score Aggregation

### Three Source Tables

`
submissions (status = 'approved')    → normal problem solves
arena_submissions (status = 'reviewed') → graded contest submissions  
weekly_submissions (status = 'approved') → weekly challenge solves
`

### Deduplication Logic (Overall Tab)

LeaderboardPage.tsx:70-85:
1. For each (github, problem_id) pair across all 3 tables, keep the highest points_awarded
2. Sum per user → sort descending → take top 100

This prevents a user who solved the same problem in both a contest and normally from getting double points.

### Time-Windowed Tabs

Weekly and Monthly tabs add created_at >= cutoff (or submitted_at for weekly_submissions). Monthly tab accepts a monthOffset state variable, allowing browsing past months.

**Note**: Time-windowed tabs do NOT deduplicate across tables. A user solving the same problem in both submissions and rena_submissions in the same week gets counted twice. This is a known limitation.

### Streak Tab

Shows users sorted by current streak. effectiveStreak() function self-corrects: if last_solved_at was more than 1 day ago (calendar days), streak resets to 0 regardless of stored streak value. Only users with streak > 0 are shown.

---

## Deep Dive 6: Email System

### Provider

Brevo (formerly Sendinblue) via REST API. Keys: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME.

**File**: src/lib/email.ts

### Email Types

| Kind | ref_id pattern | Trigger |
|---|---|---|
| subscription_confirmed | Razorpay paymentId | After successful payment verification |
| contest_live | Contest UUID | Admin broadcasts from admin panel |
| weekly_challenge | Challenge UUID | Admin broadcasts from admin panel |
| subscribe_nudge | 'YYYY-MM' | Daily cron (09:00 UTC) + admin manual |
| inactivity_nudge | 'YYYY-MM' | Weekly prune job (Sunday 03:00 UTC) |
| certificate_* | Certificate UUID | Certificate issuance |

### Dedup Pattern (Critical)

ALL email sends follow: **send first, log after success, never log on failure**.

This means:
- A logged email_log row = confirmed delivery
- A failed send gets retried automatically on next cron/admin click
- Clicking "broadcast" twice is safe (skips already-delivered recipients)

### Inactivity Nudge

Criteria (dmin/prune/route.ts:114-118):
- Has email on file (has logged in since email sync shipped)
- NOT already nudged this calendar month
- last_solved_at (or joined_at if never solved) is older than 30 days

No data is ever deleted for inactivity. The comment in prune/route.ts:10-11 is explicit: "Nobody's data is ever removed for being inactive."
