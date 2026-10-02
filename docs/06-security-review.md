# BitByBit — Security Review

> This is an adversarial audit of the codebase. Each finding states the exact file and line range. Severity levels: Critical / High / Medium / Low / Info.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 4 |
| Low | 4 |
| Info | 5 |

---

## CRITICAL

### CRIT-1: All test cases (including "hidden") are visible to the browser

**File**: src/types/database.ts:36, src/app/problems/Workspace.tsx (Workspace receives full problem object)

**Issue**: The problems table has a single 	est_cases: TestCase[] column. There is no separate hidden_test_cases column. The full problem object — including all test case inputs and expected outputs — is loaded into the React component and available in browser memory.

A user who opens DevTools, breaks into the Pyodide Worker, or simply inspects the React component state can read every test case. There is no mechanism to withhold any test case from a browser that has loaded the problem.

**Impact**: Users can trivially hard-code expected outputs and achieve a perfect score on any auto-graded problem.

**Mitigation**: Move test cases server-side. Evaluate test cases in an API route instead of sending them to the browser. Show only sample cases client-side. Server returns pass/fail verdict, not the expected values.

---

## HIGH

### HIGH-1: Debug log leaks CRON_SECRET length to server logs

**File**: src/app/api/admin/prune/route.ts:61

`	ypescript
// TEMP DEBUG — remove after confirming, do not leave in production
console.log('[debug] token length:', token?.length, 'env length:', process.env.CRON_SECRET?.length, 'match:', token === process.env.CRON_SECRET)
`

**Issue**: The comment says to remove this. It is still in the code. Vercel log drains (Datadog, Logtail, etc.) would capture this on every cron invocation. The length is a small oracle for secret enumeration. The match: value would expose a boolean 	rue when the correct secret is used, which is not sensitive, but the log should not exist.

**Mitigation**: Remove this console.log statement.

---

### HIGH-2: Admin authorization is a 2-step check, not a JWT claim — susceptible to TOCTOU

**File**: All admin routes (pi/admin/, pi/notify/broadcast, pi/notify/resend-confirmation)

**Pattern**:
`	ypescript
const { data: user } = await authClient.auth.getUser(token);  // step 1
const github = user.user_metadata?.user_name;
const { data: admin } = await db.from('admins').eq('github', github);  // step 2
`

**Issue**: Between step 1 and step 2, a race exists. If an admin row is removed between the two DB calls, the route proceeds as if the user is still an admin. More importantly: the admin check trusts user_metadata.user_name from the JWT claims, which is set by Supabase based on GitHub OAuth data. If a GitHub username changes, the old token with the old username claim may still validate against a newly-inserted dmins row for the new username. In practice: low risk for a college club, but architecturally the correct fix is a Postgres function/RLS approach that evaluates in a single DB round-trip.

**Mitigation**: Move admin check into Supabase RLS or a single security definer function (as done in the certificates migration).

---

### HIGH-3: CSP contains unsafe-eval and unsafe-inline for all script-src

**File**: 
ext.config.mjs:59

`
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com
`

**Issue**: Both unsafe-eval and unsafe-inline defeat the purpose of a Content Security Policy for XSS protection. With unsafe-eval, any injected XSS payload can use eval() to execute arbitrary code. With unsafe-inline, inline event handlers (onclick="...") would also execute.

**Why it exists**: Monaco Editor requires unsafe-eval; Pyodide requires both. The comment in 
ext.config.mjs acknowledges this.

**Mitigation**: Use nonce-based CSP for inline scripts (Next.js supports this since 13.4). For Monaco and Pyodide, evaluate whether they can run in an isolated iframe with a more permissive CSP that doesn't affect the main frame.

---

## MEDIUM

### MED-1: AI rate limits are enforced client-side — bypassable

**File**: src/lib/gemini.ts — all limit checks happen in the browser

**Issue**: Usage limits (daily hint counts, cooldowns) are tracked in localStorage and synced from i_usage. A user who:
1. Clears localStorage
2. Intercepts the efreshUsageFromServer call
3. Directly POSTs to /api/ai without going through gemini.ts

...can exceed all limits. /api/ai/route.ts does not perform any rate-limit check server-side.

**Impact**: A motivated user can exhaust Groq quota (30 req/min free tier) for all users.

**Mitigation**: Implement server-side rate limiting in /api/ai/route.ts. Check i_usage DB table before calling Groq, increment atomically using a DB transaction or upsert.

---

### MED-2: practice_attempts recorded using anon client — no auth verification

**File**: src/app/problems/Workspace.tsx:954-957

`	ypescript
(db.from('practice_attempts') as any).upsert(
  { problem_id: problem.id, github: user.github, name: user.name, lang },
  ...
)
`

**Issue**: This uses db which is the anon-key Supabase client. The github value comes from the client-side user state, not from a re-verified JWT. If the practice_attempts RLS policy allows writes with any github value (i.e., no RLS), a user could insert records for any other user's GitHub handle.

**Impact**: Low (practice_attempts are telemetry-only and pruned every 60 days), but the pattern is architecturally wrong.

**Mitigation**: Verify github server-side, or use Supabase RLS policy that constrains github = auth.jwt() -> 'user_metadata' ->> 'user_name'.

---

### MED-3: Admin localStorage cache (1 hour TTL) could allow revoked admin access

**File**: src/lib/supabase.ts:54

**Issue**: Admin status is cached in localStorage with a 1-hour TTL. If an admin is removed from the dmins table, they retain UI-level admin access for up to 1 hour. Server-side API routes always re-verify, so they would correctly reject requests, but the admin panel UI would still be visible and appear functional.

**Impact**: UX confusion, not a true security bypass (API routes block).

**Mitigation**: Reduce TTL to 5 minutes, or use Supabase Realtime to invalidate the cache on dmins table changes.

---

### MED-4: Leaderboard reads up to 5000 rows with no server-side pagination

**File**: src/components/pages/LeaderboardPage.tsx:64-65

`	ypescript
db.from('submissions').select(...).eq('status', 'approved').limit(5000)
`

**Issue**: At scale, 5000 rows × 3 tables × multiple columns is a substantial client-side payload and memory footprint. If submissions exceed 5000, the leaderboard silently truncates, producing incorrect rankings.

**Impact**: At current club size (college club), this is fine. At 200+ active members submitting 20+ problems each it becomes a problem.

**Mitigation**: Aggregate scores server-side in a Postgres function or materialized view. Return only the top-100 ranked rows.

---

## LOW

### LOW-1: NEXT_PUBLIC_PAYMENTS_LIVE flag has no server-side enforcement

**File**: .env.example:18

**Issue**: NEXT_PUBLIC_PAYMENTS_LIVE=true is a client-side flag. The payment UI conditional rendering depends on it, but the API route at /api/razorpay/create-order does not check this flag. Setting it to alse in .env.local for development would prevent the UI from showing the payment button, but a direct curl to /api/razorpay/create-order would still create a live Razorpay order.

**Mitigation**: Check NEXT_PUBLIC_PAYMENTS_LIVE (or a server-only equivalent) in the API route and return a 503 in dev mode.

---

### LOW-2: Webhook endpoint has no replay protection

**File**: src/app/api/razorpay/webhook/route.ts

**Issue**: Razorpay webhooks are verified by signature, but there is no deduplication of replayed webhook events beyond the azorpay_payment_id check in the UPSERT. If Razorpay sends the same event twice (which it does on delivery failures), the UPSERT is idempotent — this is actually handled correctly. However, there is no timestamp validation to reject events older than a tolerance window (e.g., 5 minutes), which is a best practice for webhook security.

**Mitigation**: Check payload.event.created_at against Date.now() and reject if > 5 minutes old.

---

### LOW-3: Arena draft code stored in localStorage without size limits

**File**: src/app/problems/Workspace.tsx:76-78

**Issue**: saveArenaDraft(contestId, problemId, lang, code) stores code in localStorage without any size check. A user who pastes 1MB of code into the editor could fill localStorage. The 	ry/catch around localStorage calls handles the write failure silently (no user feedback).

**Mitigation**: Check code length before writing (e.g., max 100KB) and show a warning toast if exceeded.

---

### LOW-4: contest_registrations capacity check is non-atomic

**File**: src/app/api/contest/register/route.ts:104-113

`	ypescript
const { count: confirmedCount } = await db.from('contest_registrations')
  .select('id', { count: 'exact', head: true })
  .eq('contest_id', contestId).eq('status', 'confirmed');

if ((confirmedCount ?? 0) >= CONTEST_CAPACITY) { ... }
// then separately:
await db.from('contest_registrations').upsert(...);
`

**Issue**: Two concurrent requests can both read confirmedCount = 69, both pass the capacity check, and both insert — resulting in 71 registrations (1 over capacity).

**Mitigation**: Use a Postgres function with SELECT COUNT(...) FOR UPDATE or a DB-level CHECK constraint.

---

## INFO

### INFO-1: DOMPurify is correct and well-configured

**File**: src/lib/sanitize.ts

Problem descriptions are admin-authored HTML rendered with dangerouslySetInnerHTML. DOMPurify is called with a restrictive config. No XSS vector found here.

---

### INFO-2: Razorpay order amount is correctly server-side

**File**: src/app/api/razorpay/create-order/route.ts:72-80

The amount is fetched from the pp_config DB table. The client cannot influence the amount. This is the correct pattern.

---

### INFO-3: HMAC signature verification uses correct constant-time comparison

**File**: src/app/api/razorpay/verify/route.ts:77-88

Razorpay SDK's alidateWebhookSignature / alidatePaymentVerification use HMAC-SHA256 internally. No timing side-channel.

---

### INFO-4: Identity derived from JWT, not request body, in all payment routes

**File**: src/app/api/razorpay/verify/route.ts:34-50

The github identity for subscription activation comes from supabase.auth.getUser(token), not from the POST body. A user cannot subscribe another user by spoofing a github field in the request.

---

### INFO-5: Service-role key never exposed to client

**File**: src/lib/supabase.ts:43-50 (createServerSupabaseClient)

SUPABASE_SERVICE_ROLE_KEY is used only in server-side routes (no NEXT_PUBLIC_ prefix). It is never imported in client components. Verified by searching for SERVICE_ROLE_KEY usage — all in src/app/api/ files.
