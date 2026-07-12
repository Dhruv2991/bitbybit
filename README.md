# BitByBit 🧩

Competitive coding platform for teams. Built with Next.js + Supabase.

---

## Stack

- **Frontend** — Next.js 14, TypeScript, Tailwind CSS, Monaco Editor
- **Backend** — Supabase (Postgres + Auth + Realtime)
- **AI** — Groq (primary) with a self-hosted Ollama fallback
- **Code Execution** — In-browser (Pyodide/Web Workers) for Python & JS, Wandbox.org for C++/Java/Go/Rust
- **Payments** — Manual UPI flow (no third-party gateway)
- **Auth** — GitHub OAuth via Supabase Auth

---

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in your Supabase and Groq/Ollama credentials
npm run dev
```

---

## 🔒 AI Features — Subscribers Only

All AI-powered features are **restricted to logged-in, subscribed users**. Anyone else — signed-out visitors as well as signed-in but non-subscribed members — is blocked with a clear message instead of getting an AI response.

This is enforced in one place: [`src/lib/gemini.ts`](src/lib/gemini.ts).

### How the gate works

1. **`setAiUser(github, isSubscriber)`** must be called (typically after auth state resolves in `src/app/page.tsx`) to tell the AI layer who the current user is and whether they hold an active subscription. Until this is called with a real GitHub username, the module treats the user as signed out.
2. Every AI function funnels through **`subscriberCheck()`** before it will call Groq/Ollama:
   - No `github` set → `⛔ Sign in to use AI features.`
   - `github` set but `isSubscriber` is `false` → `⭐ AI features are available to subscribers. Subscribe once for lifetime access to all AI tools + weekly challenges.`
   - Otherwise → request proceeds.
3. On top of the subscriber gate, per-feature **daily limits** apply (see table below) so a single subscriber account can't hammer the AI provider, and hints additionally have a 30s cooldown per problem.
4. Usage counters are stored **server-side in Supabase** (`ai_usage` table, keyed by `github` + `date` + `feature`) with a `localStorage` cache purely for fast UI reads — so limits can't be reset just by clearing browser storage.

### AI features gated behind subscription

| Feature | Function | Daily limit |
|---|---|---|
| Explain why my code failed | `explainFailure()` | 5 |
| AI hint (per problem) | `getAiHint()` | 3 (+30s cooldown) |
| Code review | `reviewCode()` | 3 |
| Problem recommendations | `getRecommendations()` | 5 |
| AI editorial | `generateEditorial()` | 2 |
| Approach validator | `validateApproach()` | subscriber-only, no separate cap |

> Admin-only AI tools (test case generator, description improver, full problem generator, plagiarism detector) are called only from the Admin Panel, which is already restricted to admins via `resolveAdminStatus()` in `src/lib/supabase.ts` — these are not exposed to regular users at all.

### Enforcing this correctly when you extend the app

If you add a new AI-powered feature or a new entry point (page, component, API route) that calls into `gemini.ts`:

- **Always** route the call through `checkGlobal()`, `checkHint()`, or `subscriberCheck()` first — never call `callAI()` directly from UI code.
- **Never** trust a client-side `isSubscriber` flag alone for anything sensitive server-side; the source of truth for subscription status is the members/subscriptions table in Supabase, checked at the point `setAiUser()` is populated.
- If you add a new API route under `src/app/api/`, re-verify the caller's session and subscription status there too — don't rely solely on the client having called `setAiUser()` correctly, since API routes can be hit directly.
- Keep the "signed out" vs "signed in but not subscribed" messages distinct (as `subscriberCheck()` does) so users get an accurate next step (log in vs. subscribe).

---

## Subscriptions & Auth Flow

1. Users **sign in with GitHub** (Supabase Auth, `github` used as the unique identity/username throughout the app).
2. Signed-in users can go to **Subscribe** and pay a one-time lifetime fee via **UPI**:
   - They see a QR code generated from the admin's configured UPI ID.
   - They pay in any UPI app and submit their transaction ID.
   - The subscription request is saved as `pending`.
   - An **admin manually verifies** the transaction and confirms it in the Admin Panel, which flips the member to subscriber status.
3. Once confirmed, `isSubscriber` becomes `true` for that account and all AI features unlock (subject to the daily limits above). Non-subscribers and signed-out users continue to see the upgrade/sign-in prompts instead of AI output.

---

## Payments — UPI Flow

No Razorpay or payment gateway needed. The flow is entirely manual:

1. **Admin** creates a contest and sets a UPI ID (e.g. `yourname@upi`) in the Contests tab of the Admin Panel.
2. **User** clicks "Register" on the contest card — they see a **QR code** generated from the UPI ID.
3. User scans the QR with any UPI app (PhonePe, GPay, Paytm, etc.) and pays.
4. User enters their **transaction ID** (from payment history in their UPI app) and clicks Submit.
5. The registration is saved as **pending** in the database.
6. **Admin** sees the pending registration in Admin → Contests with the transaction ID displayed, and clicks **Confirm** or **Reject** after verifying in their bank/UPI app.

The same manual pending → admin-confirms pattern is used for the one-time lifetime AI subscription described above.

### Supabase table

The `contest_registrations` table already has a `upi_id` column and `status` (`pending` / `confirmed` / `rejected`). No migration needed if you used the original schema.

---

## AI Provider Setup

AI runs through Groq first, with a local Ollama server as a fallback.

1. Get a free API key at https://console.groq.com and add it to `.env.local`:
   ```
   NEXT_PUBLIC_GROQ_KEY=your-groq-key-here
   ```
2. (Optional) Run a fallback model locally with Ollama for when Groq is rate-limited or unavailable:
   ```bash
   ollama run qwen2.5-coder:3b
   ```
   Then set:
   ```
   NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434
   NEXT_PUBLIC_OLLAMA_MODEL=qwen2.5-coder:3b
   ```

If neither is configured, AI calls will fail gracefully with an "AI is unavailable right now" message rather than crashing the app — but note the subscriber gate is checked *before* either provider is called, so unauthorized users never trigger an AI request in the first place.

---

## Code Execution

- **Python & JavaScript** run entirely client-side in the browser via Pyodide (WASM CPython) and Web Workers — no server round-trip, no API key.
- **C++, Java, Go, Rust** are compiled server-side via Wandbox.org, called from `src/app/api/execute/route.ts`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side admin actions) |
| `NEXT_PUBLIC_GROQ_KEY` | ⚠️ | Groq API key — primary AI provider |
| `NEXT_PUBLIC_OLLAMA_URL` | ❌ | Fallback Ollama server URL (defaults to `http://localhost:11434`) |
| `NEXT_PUBLIC_OLLAMA_MODEL` | ❌ | Fallback Ollama model (defaults to `qwen2.5-coder:3b`) |
| `JUDGE0_URL` | ❌ | Optional Judge0 executor URL |

No Razorpay keys needed. UPI IDs are managed per-contest / for the AI subscription in the Admin Panel.

---

## Admin Panel

- **Overview** — Member stats, submission counts
- **Submissions** — Review & approve/reject code submissions
- **Problems** — Create/edit problems with test cases (includes AI-assisted problem/test-case generation, admin-only)
- **Members** — View all registered members, manage subscription status
- **Contests** — Create contests, set UPI ID, manage status, verify registrations
