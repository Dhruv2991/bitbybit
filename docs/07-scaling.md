# BitByBit — Scaling & Operational Guide

> Current deployment: Vercel Hobby plan. All limits and ceilings cited from source.

---

## 1. Current Scale Assumptions

The codebase is written for a college coding club. Operational assumptions visible in the code:

| Assumption | Evidence |
|---|---|
| <200 active members | Leaderboard limit(1000) on members, limit(5000) on submissions |
| <70 participants per contest | Hard-coded CONTEST_CAPACITY = 70 in contest/register/route.ts:102 |
| <100 emails per broadcast | maxDuration = 60s allows ~40-100 sequential Brevo sends |
| 1-3 admins | Admin check is a simple dmins table row |
| Vercel Hobby plan | 2-cron limit documented in dmin/prune/route.ts:5-7 |

---

## 2. Vercel Serverless Constraints

| Constraint | Value | Affected Routes |
|---|---|---|
| Default function timeout | 10s | All routes |
| Extended timeout (Hobby) | 60s | 
otify/broadcast, 
otify/subscribe-nudge, dmin/prune |
| Max cron jobs (Hobby) | 2 | subscribe-nudge (daily) + prune (weekly) |
| Cold start | ~200-500ms | All API routes |
| Memory limit | 1024MB | Code execution (execute/route.ts) |

The 60s limit for email routes is why emails are sent **sequentially, not in parallel**. Parallel sends would be faster but risk exceeding the per-request memory and connection limits.

---

## 3. Bottlenecks & Scaling Boundaries

### 3.1 Code Execution (Server)

**Current**: Judge0 self-hosted (optional) → Wandbox public fallback

**Wandbox risks**:
- Public free service, no SLA
- No authentication; rate limits unknown
- Shared with the entire internet
- At >50 concurrent users running tests, Wandbox becomes the bottleneck

**Scaling path**:
1. Spin up a Judge0 instance on Railway/Fly.io (Docker image available)
2. Set JUDGE0_URL env var
3. Alternatively: migrate to a managed sandbox like Piston API or Judge0 SaaS

### 3.2 Code Execution (Browser — Python)

Pyodide WASM (~15MB) is loaded from CDN on first Python run. This is a one-time cost per browser session. Once loaded, Python execution is fast and has no server cost.

At 200 concurrent users, Pyodide execution adds zero load to the server. This is an excellent scaling property.

### 3.3 AI (Groq)

**Groq free tier**: 30 requests/minute. With no server-side rate limiting, 5 simultaneous users requesting hints can burst past this limit.

**Scaling path**:
1. Implement server-side rate limiting in /api/ai/route.ts
2. Queue requests (Redis + Bull queue, or Upstash QStash)
3. Upgrade Groq to a paid tier

### 3.4 Email (Brevo)

**Brevo free tier**: 300 emails/day. The broadcast route sends one email per active subscriber. At 100 subscribers, one broadcast = 100 emails. Two broadcasts per day would exceed the free limit.

**Scaling path**:
1. Upgrade to Brevo Starter (20k emails/day)
2. Alternatively: switch to Resend, Postmark, or AWS SES

### 3.5 Supabase Database

**Supabase free tier**: 500MB storage, 2 active connections per process.

**Scaling path**:
1. Add indexes (already present on certificates table; verify submissions, rena_submissions)
2. Upgrade to Supabase Pro for connection pooling (PgBouncer)
3. Add materialized views for leaderboard aggregation

### 3.6 Leaderboard Aggregation

**Current**: Client fetches up to 5000 rows from 3 tables and aggregates in JavaScript. O(n) in browser memory.

**At 500+ members**: 5000-row limit silently truncates; rankings become incorrect.

**Scaling path**:
1. Create a Postgres function get_leaderboard(tab, cutoff_start, cutoff_end) that aggregates server-side
2. Return only the top-100 rows
3. Cache with a 1-minute TTL using Vercel Edge Config or Supabase RPC caching

---

## 4. Cron Job Reliability

### Current Cron Setup (vercel.json)

`json
{
  "crons": [
    { "path": "/api/notify/subscribe-nudge", "schedule": "0 9 * * *" },
    { "path": "/api/admin/prune",            "schedule": "0 3 * * 0" }
  ]
}
`

### Auth Pattern

Vercel Cron automatically sends Authorization: Bearer {CRON_SECRET} when CRON_SECRET is set. The GET handler in both routes validates this:

`	ypescript
// subscribe-nudge/route.ts:64-70
if (!token || !CRON_SECRET || token !== CRON_SECRET) return 401;
`

### Failure Modes

| Scenario | Behavior |
|---|---|
| Cron runs but Brevo is down | Emails fail; no email_log rows written; retried on next cron |
| Cron runs but Supabase is down | Route throws 500; Vercel logs the error; no retry built in |
| Cron exceeds 60s | Vercel kills the function; partial sends logged but some recipients missed |

**Note**: There is no dead-letter queue or alerting on cron failure. Add Vercel Log Drain + alerting in production.

---

## 5. Database Index Recommendations

From the certificates migration, these indexes are defined:
`sql
CREATE INDEX idx_certificates_github ON certificates(github);
CREATE INDEX idx_certificates_cert_id ON certificates(certificate_id);
CREATE INDEX idx_certificates_status ON certificates(status);
CREATE INDEX idx_certificates_created_at ON certificates(created_at DESC);
`

Recommended (not found in repo migrations):
`sql
-- Submissions: frequent filters
CREATE INDEX idx_submissions_github ON submissions(github);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);

-- Arena submissions: leaderboard queries
CREATE INDEX idx_arena_submissions_github ON arena_submissions(github);
CREATE INDEX idx_arena_submissions_status ON arena_submissions(status);

-- Email log: dedup lookups
CREATE INDEX idx_email_log_github_kind_refid ON email_log(github, kind, ref_id);

-- AI usage: daily limit checks
CREATE INDEX idx_ai_usage_github_date ON ai_usage(github, date);
`

---

## 6. Operational Runbook

### Manually Trigger Cron Jobs

`ash
# Subscribe nudge (POST from admin panel is easier, but for emergencies):
curl -X POST https://your-app.vercel.app/api/notify/subscribe-nudge \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Prune maintenance:
curl -X POST https://your-app.vercel.app/api/admin/prune \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
`

### Backfill Emails for Existing Users

After deploying for the first time:
`ash
curl -X POST https://your-app.vercel.app/api/admin/backfill-emails \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
`

### Change Subscription Price

Update the pp_config table:
`sql
INSERT INTO app_config (key, value) VALUES ('subscription_amount_paise', '4900')
ON CONFLICT (key) DO UPDATE SET value = '4900';
`

No code change or redeploy needed. The create-order route reads this at runtime.

### Issue a Certificate

Use the admin panel → Certificates tab, or:
`ash
curl -X POST https://your-app.vercel.app/api/certificates/issue \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "github": "username", "event_name": "...", "achievement_text": "..." }'
`

---

## 7. Environment Variables Reference

| Variable | Server/Client | Required | Description |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Both | Yes | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Both | Yes | Supabase anon key (safe to expose) |
| SUPABASE_SERVICE_ROLE_KEY | Server only | Yes | Bypasses RLS — never expose to browser |
| GROQ_API_KEY | Server only | Yes | Groq LLM API key |
| GROQ_MODEL | Server only | No | Defaults to llama-3.3-70b-versatile |
| NEXT_PUBLIC_OLLAMA_URL | Client | No | Ollama server URL (fallback AI) |
| NEXT_PUBLIC_OLLAMA_MODEL | Client | No | Ollama model name |
| RAZORPAY_KEY_ID | Server only | Yes | Razorpay key ID |
| RAZORPAY_KEY_SECRET | Server only | Yes | Razorpay secret (HMAC signing) |
| NEXT_PUBLIC_RAZORPAY_KEY_ID | Client | Yes | Same key ID (exposed for checkout) |
| RAZORPAY_WEBHOOK_SECRET | Server only | Yes | Webhook HMAC secret |
| NEXT_PUBLIC_PAYMENTS_LIVE | Client | No | Show payment UI if 'true' |
| BREVO_API_KEY | Server only | Yes | Brevo transactional email key |
| BREVO_SENDER_EMAIL | Server only | Yes | From address |
| BREVO_SENDER_NAME | Server only | No | From name |
| JUDGE0_URL | Server only | No | Judge0 base URL (defaults to localhost) |
| CRON_SECRET | Server only | Yes | Shared secret for Vercel Cron auth |
| NEXT_PUBLIC_SITE_URL | Both | Yes | Public app URL (used in email links) |
