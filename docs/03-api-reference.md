# BitByBit — API Reference

> Every endpoint verified against source code. File citations inline.

---

## Authentication Model

All API routes derive caller identity from the Authorization: Bearer {JWT} header — **never from the request body**. Two levels of access:

| Level | How verified |
|---|---|
| **Authenticated user** | supabase.auth.getUser(token) with anon key |
| **Admin** | Authenticated user + row in dmins table matching user_metadata.user_name |
| **Cron** | Authorization: Bearer {CRON_SECRET} or x-cron-secret: {CRON_SECRET} header |

*Pattern source*: pi/admin/backfill-emails/route.ts:24-42, pi/admin/prune/route.ts:33-55

---

## Endpoints

### POST /api/auth/sync

**File**: src/app/api/auth/sync/route.ts

Syncs the authenticated user's email and name from Supabase Auth into the members table. Called by the client immediately after GitHub OAuth sign-in.

**Auth required**: Yes (any authenticated user)

**Request body**: none (identity derived from JWT)

**Response**:
`json
{ "ok": true }
// or
{ "error": "..." }
`

**Key logic**:
- Uses service-role key to bypass RLS for first-time member creation
- Reads user_metadata.user_name (GitHub handle) and email from JWT claims
- UPSERTs members table on conflict github

---

### POST /api/ai

**File**: src/app/api/ai/route.ts

Proxies AI requests to Groq (primary) or Ollama (fallback). Called by src/lib/gemini.ts.

**Auth required**: Yes (any authenticated user)

**Request body**:
`	ypescript
{
  action: 'hint' | 'explain' | 'review' | 'editorial' | 'approach' | 'visualize';
  prompt: string;
  model?: string;
}
`

**Response**:
`json
{ "result": "AI-generated text" }
// or
{ "error": "Rate limit exceeded" }
`

**Key logic**:
- Tries Groq first (GROQ_API_KEY, model from GROQ_MODEL env or request body)
- Falls back to Ollama (NEXT_PUBLIC_OLLAMA_URL) on any Groq failure
- Rate limiting handled client-side by gemini.ts; this route does no server-side rate limiting

---

### POST /api/execute

**File**: src/app/api/execute/route.ts

Executes C++, Java, Rust, or Go code against test cases server-side.

**Auth required**: No (public; Python/JS are handled in-browser)

**Request body**:
`	ypescript
{
  code: string;
  lang: 'cpp' | 'java' | 'rust' | 'go';
  testCases: Array<{ input: string; expected: string }>;
}
`

**Response**:
`	ypescript
{
  passed: number;
  total: number;
  results: Array<{
    ok: boolean;
    input: string;
    expected: string;
    actual: string;
    error?: string;
  }>;
}
`

**Key logic**:
- Builds language-specific harness wrapping user function (executor.ts:1-590)
- Submits batch to Judge0; polls until complete (executor.ts:638-693)
- Falls back to Wandbox on Judge0 failure (3 retries, 10s timeout)

---

### POST /api/razorpay/create-order

**File**: src/app/api/razorpay/create-order/route.ts

Creates a Razorpay order for the subscription fee. Amount is **always** read from the pp_config DB table — never from the request body.

**Auth required**: Yes (any authenticated user)

**Request body**: none (or optionally {})

**Response**:
`json
{
  "orderId": "order_xxx",
  "amount": 3900,
  "currency": "INR",
  "key": "rzp_live_xxx"
}
`

**Security note**: Amount is fetched from pp_config table at key = 'subscription_amount_paise'. If row is missing, defaults to 3900 (Rs39). No user-supplied amount is ever trusted.

---

### POST /api/razorpay/verify

**File**: src/app/api/razorpay/verify/route.ts

Verifies a completed Razorpay payment, marks the user as a subscriber, and sends a confirmation email.

**Auth required**: Yes (any authenticated user)

**Request body**:
`	ypescript
{
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
`

**Response**:
`json
{ "success": true, "message": "Subscription activated!" }
// or
{ "error": "Payment verification failed" }
`

**Key logic** (in order):
1. Verify HMAC-SHA256 signature: orderId + '|' + paymentId signed with RAZORPAY_KEY_SECRET
2. Server re-fetch payment from Razorpay API to confirm captured status
3. Check idempotency: skip if azorpay_payment_id already in subscribers
4. Compute current_period_end via computeNewPeriodEnd() (30-day extension from today or existing end, whichever is later)
5. UPSERT subscribers with status = 'active'
6. Write email_log entry keyed on paymentId for dedup
7. Send confirmation email via Brevo

---

### POST /api/razorpay/webhook

**File**: src/app/api/razorpay/webhook/route.ts

Belt-and-suspenders backup for failed /verify calls. Razorpay sends this automatically on payment.captured.

**Auth required**: Razorpay webhook signature (RAZORPAY_WEBHOOK_SECRET)

**Request**: Raw body (Razorpay JSON payload)

**Key logic**:
- alidateWebhookSignature(body, signature, RAZORPAY_WEBHOOK_SECRET) from Razorpay SDK
- Only processes payment.captured events
- Same UPSERT logic as /verify but cannot send email (no JWT to derive github)

---

### POST /api/contest/register

**File**: src/app/api/contest/register/route.ts

Registers a subscriber for an upcoming contest. Contest entry is **free** (no payment collected).

**Auth required**: Yes + must be an active subscriber

**Request body**:
`	ypescript
{ contestId: string }
`

**Response**:
`json
{ "success": true }
// or
{ "error": "An active Rs39/month subscription is required..." }
`

**Key logic**:
- isActiveSubscription(status, current_period_end) check against subscribers table
- Contest must have status = 'upcoming'
- Hard cap: 70 confirmed registrations per contest (CONTEST_CAPACITY = 70 at line 102)
- UPSERT on conflict contest_id,github

---

### POST /api/notify/broadcast

**File**: src/app/api/notify/broadcast/route.ts

Admin-only. Emails all active subscribers about a new contest or weekly challenge.

**Auth required**: Admin JWT

**Request body**:
`	ypescript
{
  kind: 'contest_live' | 'weekly_challenge';
  refId: string;  // contest/challenge UUID — used for dedup
  title: string;  // shown in email
}
`

**Response**:
`json
{ "sent": 12, "failed": 0, "skipped": 3, "total": 12 }
`

**Idempotency**: email_log keyed on (github, kind, ref_id). Clicking twice only resends to recipients whose first send failed.

---

### GET /api/notify/subscribe-nudge (Cron)
### POST /api/notify/subscribe-nudge (Admin)

**File**: src/app/api/notify/subscribe-nudge/route.ts

Emails members who are logged-in but not subscribed. Runs daily via Vercel Cron.

**Auth for GET**: Authorization: Bearer {CRON_SECRET} (matched against env var)
**Auth for POST**: Admin JWT or x-cron-secret header

**Response**:
`json
{ "sent": 5, "failed": 1, "skipped": 2 }
`

**Dedup key**: ef_id = YYYY-MM (at most one nudge per person per calendar month)

---

### GET/POST /api/admin/prune

**File**: src/app/api/admin/prune/route.ts

Weekly maintenance job (Vercel Cron, Sunday 03:00 UTC). Does two things:
1. Deletes old rows: practice_attempts (60d), i_usage (90d), email_log (180d)
2. Sends inactivity nudge emails (no solve in 30 days)

**Auth for GET**: Authorization: Bearer {CRON_SECRET}
**Auth for POST**: Admin JWT or x-cron-secret

**Response**:
`json
{
  "deleted": { "practice_attempts": 120, "ai_usage": 45, "email_log": 30 },
  "nudges": { "sent": 8, "failed": 0, "eligible": 8 }
}
`

> **Bug note** (prune/route.ts:61): A console.log debug statement logging the CRON_SECRET length is present and marked "TEMP DEBUG — remove after confirming". This should be removed before production.

---

### POST /api/admin/backfill-emails

**File**: src/app/api/admin/backfill-emails/route.ts

One-off (re-runnable) admin tool. Reads all Supabase Auth users, matches by GitHub handle, and writes email + name into members and subscribers.

**Auth required**: Admin JWT

**Request body**: none

**Response**:
`json
{ "scanned": 87, "membersUpdated": 52, "subscribersUpdated": 12 }
`

---

### Certificate Endpoints

**File location**: src/app/api/certificates/

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| /api/certificates/issue | POST | Admin JWT | Issue a new certificate; stores PDF path; sends email |
| /api/certificates/list | GET | Admin JWT | List all certificates with filters |
| /api/certificates/revoke | POST | Admin JWT | Set status to 'revoked' |
| /api/certificates/download | GET | Auth (own) or Admin | Download certificate PDF |
| /api/certificates/verify | GET | Public | Verify certificate by certificate_id (public QR link) |
| /api/certificates/resend-email | POST | Admin JWT | Resend certificate email |

**RLS** (from migration 20261001_certificates_schema.sql):
- Admins: SELECT/INSERT/UPDATE all
- Members: SELECT own rows only (github = auth.jwt() -> 'user_metadata' ->> 'user_name')
- Public (anon): SELECT all (needed for QR verification link)

---

## Error Conventions

All API routes return JSON. On error:
`json
{ "error": "Human-readable message" }
`

HTTP status codes used:
| Code | Meaning |
|---|---|
| 400 | Bad request / validation failure |
| 401 | Missing or invalid credentials |
| 403 | Authenticated but not authorized (not admin / not subscriber) |
| 404 | Resource not found |
| 500 | Internal server error |
