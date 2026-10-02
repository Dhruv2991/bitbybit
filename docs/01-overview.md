# BitByBit — Product Overview

> **Source of truth**: all claims verified against source code. File paths cited inline.

---

## 1. What is BitByBit?

BitByBit is a **competitive-programming practice platform** built for the **TeamCodeLocked** college coding club. It lets members solve algorithm problems in six languages, compete in proctored arena contests, participate in weekly challenges, and track their progress on a leaderboard. A ₹39/month subscription gates premium features; the platform collects payment via Razorpay.

### Who Uses It

| Actor | Role |
|---|---|
| **Student (free)** | Browse problems, read descriptions, view leaderboard |
| **Student (subscriber)** | Solve problems, run code, AI features, weekly challenges, arena contests |
| **Admin** | Manage problems/contests, approve submissions, broadcast emails, issue certificates |
| **Cron (Vercel)** | Daily subscribe-nudge, weekly maintenance/prune |

---

## 2. Core Features (from code)

| Feature | Source |
|---|---|
| Multi-language code editor (Monaco) | `package.json` → `@monaco-editor/react` |
| Python/JS in-browser execution (Pyodide + Web Workers) | `src/lib/browserExecutor.ts:17-156` |
| C++/Java/Rust/Go server-side execution (Judge0 → Wandbox fallback) | `src/lib/executor.ts:591-693` |
| Auto-grading: score proportional to tests passed | `src/app/problems/Workspace.tsx:997` |
| AI features: hints, failure explanation, code review, editorial, approach validator | `src/lib/gemini.ts` |
| Groq (llama-3.3-70b) → Ollama fallback | `src/lib/gemini.ts:259-282` |
| Per-action daily AI limits stored in Supabase `ai_usage` | `src/lib/gemini.ts:106-141` |
| Proctored Arena contests (fullscreen enforcement, tab-switch strikes) | `src/components/pages/ArenaPage.tsx:195-230` |
| Weekly challenges (3-problem bundles, time-bonus scoring) | `src/components/pages/WeeklyChallengePage.tsx` |
| Leaderboard (overall, weekly, monthly, streak, challenge tabs) | `src/components/pages/LeaderboardPage.tsx:58-300` |
| Razorpay subscription (Rs39/month, manually renewed, 30-day window) | `src/app/api/razorpay/` |
| Certificate issuance + PDF download | `src/app/api/certificates/` |
| Transactional email via Brevo | `src/lib/email.ts` |
| Logic Visualizer (Python step-by-step, subscriber-only) | `src/lib/visualizer.ts` |
| Badges/achievements | `src/lib/badges.ts` |
| Discussion threads per problem | `src/components/discussion/` |
| Admin panel (problems, contests, submissions, subscribers, certificates) | `src/components/pages/AdminPage.tsx` |

---

## 3. Functional Requirements (inferred from code)

| # | Requirement | Evidence |
|---|---|---|
| FR-1 | Users authenticate via GitHub OAuth only | `src/lib/supabase.ts:22` — flowType: implicit |
| FR-2 | User identity stored as GitHub username (PK in most tables) | `src/types/database.ts:51` |
| FR-3 | Problems have visible test cases (run) and hidden test cases (same array, client decides what to show) | `src/types/database.ts:36` |
| FR-4 | Submission auto-graded when test cases exist; queued for manual review otherwise | `Workspace.tsx:1036-1053` |
| FR-5 | Points = floor(problem.points * passed/total) | `Workspace.tsx:997` |
| FR-6 | Resubmission never lowers score (keeps max) | `Workspace.tsx:1043-1044` |
| FR-7 | Streak increments if user solved at least one problem within 24h of last solve | `Workspace.tsx:117-120` |
| FR-8 | Subscription grants: problem access, weekly challenges, free contest entry, AI features | `src/app/api/contest/register/route.ts:62-75` |
| FR-9 | Contest entry is free for subscribers; Razorpay only used for subscription fee | `contest/register/route.ts:1-14` |
| FR-10 | Arena: 3 fullscreen/tab-switch violations trigger automatic disqualification | `ArenaPage.tsx:202,218` |
| FR-11 | Strike penalty: score * max(0.7, 1 minus strikes*0.1) | `ArenaPage.tsx:297` |
| FR-12 | Email deduplication via email_log table | `api/razorpay/verify/route.ts:169-175` |

---

## 4. Non-Functional Requirements (inferred from code)

| # | Requirement | Evidence |
|---|---|---|
| NFR-1 | Serverless (Vercel); maxDuration=60s for batch-email routes | `notify/broadcast/route.ts:24` |
| NFR-2 | No admin writes from browser without JWT re-verification | All admin routes call getVerifiedAdmin() |
| NFR-3 | Payment amount resolved server-side from app_config table | `razorpay/create-order/route.ts:72-80` |
| NFR-4 | HMAC-SHA256 webhook signature verification (timing-safe equal) | `razorpay/verify/route.ts:77-88` |
| NFR-5 | XSS protection: DOMPurify for admin HTML in problem descriptions | `src/lib/sanitize.ts` |
| NFR-6 | CSP in next.config.mjs (contains unsafe-inline/unsafe-eval due to Monaco/Pyodide) | `next.config.mjs:59` |
| NFR-7 | Code drafts persisted to localStorage per problem+language | `Workspace.tsx:47-62` |
| NFR-8 | Admin status cached in localStorage with 1-hour TTL | `src/lib/supabase.ts:54` |
| NFR-9 | Vercel Cron: daily subscribe-nudge at 09:00 UTC, weekly prune at 03:00 Sunday UTC | `vercel.json` |

---

## 5. Full Tech Stack

| Technology | Version | Purpose | Why this choice |
|---|---|---|---|
| Next.js | 14.2.3 | Full-stack framework (App Router) | SSR + API routes in one repo; Vercel native |
| TypeScript | 5.x | Type safety | Catch schema drift at compile time |
| Tailwind CSS | 3.4.1 | Utility-first styling | Rapid UI iteration; no CSS files per component |
| Supabase | 2.43.1 (JS client) | Postgres DB + Auth + Realtime | Managed Postgres with built-in Auth/RLS/Realtime |
| Supabase Auth | via @supabase/ssr | GitHub OAuth, session management | Zero-config social login |
| Razorpay | 2.9.6 (Node SDK) | Payment collection (Rs39/mo subscription) | Indian-market payment gateway |
| Brevo | REST API | Transactional emails | 300 free emails/day |
| Groq | REST API | LLM inference (llama-3.3-70b) | Fast (~1-3s) free tier; 30 req/min |
| Ollama | REST API | LLM fallback (qwen2.5-coder:3b) | Self-hosted; handles Groq overflow |
| Pyodide | 0.26.1 (CDN) | Python execution in browser | No server cost; sandboxed WASM |
| Web Workers | Browser API | JS execution sandbox | Isolated execution with 5s timeout |
| Judge0 | Self-hosted (optional) | C++/Java/Rust/Go execution | Battle-tested multi-language sandbox |
| Wandbox | Public REST API | Fallback when Judge0 unreachable | Free public service; 3-retry logic |
| Monaco Editor | 4.6.0 | Code editor | VSCode-grade editor in-browser |
| DOMPurify | 3.1.6 | HTML sanitization | XSS protection for admin-authored HTML |
| jsPDF | 2.5.1 | Certificate PDF generation | Client-side PDF, no server dependency |
| QRCode | 1.5.3 | QR code in certificates | Verification URL embedded in PDF |
| Vercel Analytics | 1.3.1 | Page-view tracking | Zero-config analytics |
| Lucide React | 0.383.0 | Icons | Consistent icon set |

---

## 6. Repository Structure

```
bit-by-bit-updated/
├── .env.example              # All required env vars with comments
├── next.config.mjs           # CSP headers, webpack readlink patch (Node v24 fix)
├── vercel.json               # 2 cron jobs: subscribe-nudge + prune
├── package.json              # Dependencies
├── patch-readlink.cjs        # Node v24/Windows FS patch (loaded before Next)
├── supabase/
│   └── migrations/
│       └── 20261001_certificates_schema.sql   # Only migration tracked in repo
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout (font imports, Vercel Analytics)
│   │   ├── (app)/            # Route group — all user-facing pages
│   │   │   ├── problems/     # /problems route
│   │   │   ├── arena/        # /arena route
│   │   │   ├── leaderboard/  # /leaderboard route
│   │   │   ├── weekly/       # /weekly route
│   │   │   ├── subscribe/    # /subscribe route
│   │   │   ├── profile/      # /profile route
│   │   │   └── admin/        # /admin route
│   │   ├── problems/
│   │   │   └── Workspace.tsx # 1579-line component: editor + AI + submit
│   │   └── api/
│   │       ├── ai/route.ts             # POST /api/ai — Groq proxy + AI limits
│   │       ├── auth/sync/route.ts      # POST /api/auth/sync — email backfill
│   │       ├── execute/route.ts        # POST /api/execute — server execution
│   │       ├── razorpay/
│   │       │   ├── create-order/       # POST — create Razorpay order
│   │       │   ├── verify/             # POST — verify payment + subscribe
│   │       │   └── webhook/            # POST — Razorpay webhook backup
│   │       ├── contest/register/       # POST — subscriber-only contest entry
│   │       ├── notify/
│   │       │   ├── broadcast/          # POST — admin email blast
│   │       │   ├── resend-confirmation/ # POST — resend subscription email
│   │       │   └── subscribe-nudge/   # GET (cron) / POST (admin) nudge
│   │       ├── admin/
│   │       │   ├── backfill-emails/   # POST — one-off email backfill
│   │       │   └── prune/             # GET (cron) / POST (admin) maintenance
│   │       └── certificates/
│   │           ├── issue/             # POST — issue certificate
│   │           ├── list/              # GET — list certificates
│   │           ├── revoke/            # POST — revoke certificate
│   │           ├── download/          # GET — download PDF
│   │           ├── verify/            # GET — public verification
│   │           └── resend-email/      # POST — resend cert email
│   ├── components/
│   │   ├── pages/             # Full-page React components (one per route)
│   │   ├── code-editor/       # Editor, LangTabs, TestResults, Visualizer
│   │   ├── arena/             # ContestEntryButton
│   │   ├── discussion/        # ProblemDiscussion
│   │   └── layout/            # Navbar, Footer
│   ├── lib/
│   │   ├── supabase.ts        # Client singleton + server client + admin cache
│   │   ├── browserExecutor.ts # Pyodide + Web Worker execution engine
│   │   ├── executor.ts        # Server: Judge0 + Wandbox, harness builder
│   │   ├── gemini.ts          # AI features (Groq/Ollama), limits, localStorage cache
│   │   ├── email.ts           # Brevo transactional email + all templates
│   │   ├── subscription.ts    # computeNewPeriodEnd, isActiveSubscription
│   │   ├── sanitize.ts        # DOMPurify wrapper
│   │   ├── badges.ts          # Badge definitions + unlock logic
│   │   ├── streak.ts          # calendarDaysBetween helper
│   │   ├── visualizer.ts      # Logic Visualizer (Pyodide trace)
│   │   └── typeHelpers.ts     # Language-specific type name helpers
│   └── types/
│       └── database.ts        # All entity types + STARTER_CODE templates
```

