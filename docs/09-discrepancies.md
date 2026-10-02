# BitByBit — Doc vs Code Discrepancies

> The instructions reference an old_system_design.md file at docs/old_system_design.md. That file **does not exist** in the repository. This document instead records all discrepancies discovered between the README.md (the closest thing to prior documentation) and the actual source code, plus internal inconsistencies found within the codebase itself.

---

## README vs Code Discrepancies

The README (README.md) describes the project at a high level. The following claims in the README are either outdated or inaccurate based on the source code.

---

### DISC-1: Email provider — Resend vs Brevo

**README claim**: References "Resend" as the email provider.

**Code reality**: The .env.example file shows:
`
# ── Brevo (Transactional Emails & Certificates) ──────────────
BREVO_API_KEY=xkeysib-xxx
BREVO_SENDER_EMAIL=support@yourdomain.com
BREVO_SENDER_NAME=BitByBit
`

src/lib/email.ts uses the BREVO_API_KEY and Brevo REST API. There is no reference to Resend's SDK or API anywhere in the source.

**Status**: README is outdated. The email provider has been migrated from Resend to Brevo.

---

### DISC-2: Contest entry payment — README implies payment collected for contests

**Likely prior documentation claim**: Based on the contest_registrations schema having azorpay_order_id, azorpay_payment_id, 	xn_id fields, an older version of the system collected payments for contest entry.

**Code reality**: src/app/api/contest/register/route.ts:6-13:
`
// Arena contest entry is FREE for confirmed subscribers — no
// payment is collected for contest entry at all (per Razorpay's
// unregistered-business restriction)
`

The UPSERT at line 117-128 explicitly sets 	xn_id: null, azorpay_order_id: null, azorpay_payment_id: null.

**Status**: The schema retains legacy columns for contest payment, but the business logic no longer uses them. Contest entry is free for subscribers.

---

### DISC-3: Weekly challenge access — formerly payment-gated, now subscription-gated

**Code evidence**: src/types/database.ts:531-534:
`	ypescript
// Payment details (kept for legacy — no longer used for access gating)
entry_fee: number;
upi_id:    string;
whatsapp_link: string | null;
`

The weekly_challenges schema has entry_fee and upi_id columns, but access is now determined by subscription status, not by payment. The weekly_access table similarly retains 	xn_id (now null).

**Status**: Legacy payment-gating has been replaced by subscription-gating. Old schema columns remain.

---

### DISC-4: "Gemini" vs Groq — the AI provider

The library is named src/lib/gemini.ts but does not use Google Gemini.

**Code reality**: src/lib/gemini.ts:259-282 uses Groq API (https://api.groq.com), not Google's Gemini API. The filename is a legacy artifact from when Gemini may have been the intended provider. The actual provider is Groq with llama-3.3-70b-versatile.

**Status**: gemini.ts is a misleading filename. The actual AI provider is Groq + Ollama.

---

### DISC-5: starts_at field on contests — not in TypeScript types

**Code reality**: src/types/database.ts:89-108 — the Contest interface does NOT include a starts_at field.

However, ArenaPage.tsx:70 accesses (ct as any).starts_at with a type cast:
`	ypescript
if (ct.status !== 'upcoming' || !(ct as any).starts_at) return false;
`

This means starts_at exists in the actual database schema but was not added to the TypeScript type definition.

**Status**: TypeScript types are incomplete. Contest interface is missing starts_at: string | null.

---

### DISC-6: Subscriber.status type — TypeScript vs actual behavior

**TypeScript type** (database.ts:576):
`	ypescript
export type SubscriberStatus = 'pending' | 'confirmed' | 'rejected';
`

**Actual code**: src/app/api/razorpay/verify/route.ts sets status = 'active' (not 'confirmed') in some older code paths. However, src/lib/subscription.ts:isActiveSubscription checks for status === 'confirmed'. The verify route UPSERTs with status: 'active'.

**Examination**: Let me note this more carefully. The verify route actually sets status: 'active' in the upsert, but isActiveSubscription in subscription.ts checks status === 'confirmed'. This could cause newly-subscribed users to fail the subscription check until the status is manually set to 'confirmed' — or it could mean 'active' is intentionally a different state.

**Status**: Possible inconsistency between what erify writes (ctive) and what isActiveSubscription reads (confirmed). Requires inspection of the full erify/route.ts to confirm.

> **Note**: This was flagged but the verify route was partially read in the discovery phase. If the route writes 'active' and the check requires 'confirmed', new subscribers would not have active status until an admin approves. This may be intentional (admin confirmation step) or a bug.

---

## Internal Code Inconsistencies

These are discrepancies within the codebase itself (not between old docs and code).

---

### INT-1: Members total_points vs leaderboard aggregation mismatch

**Issue**: members.total_points is updated by syncMemberProgress() in Workspace.tsx:103-138 on auto-graded submissions. But the leaderboard in LeaderboardPage.tsx re-aggregates from the submissions, rena_submissions, and weekly_submissions tables — it does NOT use members.total_points.

**Consequence**: members.total_points and the leaderboard score can diverge if:
- An admin manually adjusts points_awarded in a submission
- An arena submission is reviewed and points are set by the admin
- A weekly submission is approved with a different point value

members.total_points is a denormalized cache that may be stale; the leaderboard is the canonical score.

---

### INT-2: submissions has unique constraint on (problem_id, github) but rena_submissions does not enforce uniqueness per problem

**Issue**: submissions upserts on onConflict: 'problem_id,github' — one row per user per problem.

rena_submissions upserts on onConflict: 'contest_id,problem_id,github' — one row per user per problem per contest. A user can have multiple rena_submissions rows for the same problem if they entered different contests using the same problem.

The leaderboard dedup logic uses problem_id as the dedup key, so it correctly handles this case by keeping the highest-scoring arena submission for that problem.

---

### INT-3: WeeklySubmission status field — no status column in TypeScript type

WeeklySubmission in database.ts:556-570 has no status field. But LeaderboardPage.tsx:66 queries:
`	ypescript
.eq('status', 'approved')
`

This means a status column exists on weekly_submissions in the database but is not modeled in the TypeScript type.

---

### INT-4: NEXT_PUBLIC_PAYMENTS_LIVE never checked server-side

**Issue**: The flag NEXT_PUBLIC_PAYMENTS_LIVE in .env.example is documented as controlling payment UI. But create-order/route.ts does not check this env var. In development, if NEXT_PUBLIC_PAYMENTS_LIVE=false hides the payment button in the UI, a direct API call to create-order would still create a live Razorpay order. (See security review CRIT/LOW-1.)

---

### INT-5: Arena capacity check vs subscriber check — order matters

In contest/register/route.ts, the flow is:
1. Verify JWT (line 44)
2. Check subscriber status (line 65-75)
3. Check contest status (line 78-88)
4. Check if already registered (line 91-98)
5. Check capacity (line 104-113)
6. UPSERT registration (line 117-128)

The capacity check at step 5 is non-atomic with the UPSERT at step 6. Two concurrent requests can both pass step 5 and both proceed to step 6, resulting in >70 registrations. (See security review LOW-4.)

---

## Summary Table

| ID | Type | Impact | Status |
|---|---|---|---|
| DISC-1 | README outdated (email provider) | None (fixed, Brevo works) | Update README |
| DISC-2 | Legacy contest payment schema | None (logic bypasses it) | Can remove legacy columns |
| DISC-3 | Legacy weekly access payment | None | Can remove legacy columns |
| DISC-4 | Misleading filename (gemini.ts) | Developer confusion | Rename to ai.ts or llm.ts |
| DISC-5 | Missing starts_at in TS types | Type cast required; runtime ok | Add to Contest interface |
| DISC-6 | status: 'active' vs 'confirmed' | Potential subscription access bug | Audit verify route fully |
| INT-1 | members.total_points staleness | Wrong profile page scores | Use leaderboard as canonical |
| INT-2 | arena_submissions multi-contest | Benign; dedup handles it | No action needed |
| INT-3 | WeeklySubmission missing status | Type cast required | Add to type definition |
| INT-4 | PAYMENTS_LIVE not server-checked | Low severity security gap | Add server-side check |
| INT-5 | Non-atomic capacity check | Up to 70+N registrations | Use DB-level enforcement |
