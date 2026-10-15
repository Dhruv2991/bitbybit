# BitByBit — Master Architectural Blueprint

> **Specification Version:** 1.1.0  
> **Status:** Authoritative Repository Specification  
> **Target Directory:** `.agent/00-master-blueprint.md`  
> **Scope:** Full-stack architecture, repository topology, design doctrine, and engineering protocol.

---

## 1. System Mission & Product Scope

**BitByBit** (developed for the *TeamCodeLocked* competitive coding club) is an enterprise-grade competitive programming and developer assessment platform. The system bridges the gap between traditional online judges (LeetCode/Codeforces) and collaborative educational tooling with high-precision visualizers and time-lapse execution forensics.

### Core Product Capabilities
1. **Competitive Arena & Code Duels:**
   - Proctored, real-time competitive contests and code duels with anti-cheat strike detection and automated point decay.
   - Live telemetry panes displaying submission streams, active strikes, and penalty calculations (`strike_penalty_factor`).
   - Weekly curated coding challenges with automated leaderboard progression and daily solve streaks.
2. **Multi-Language Isolated Code Execution (Judge0 & Pyodide):**
   - Server-isolated execution across 6 programming languages (**Python 3, JavaScript, C++, Java, Rust, Go**).
   - High-throughput batch test-case execution via self-hosted **Judge0** (connected via local container or secure **Cloudflare Tunnel**), featuring LeetCode-style native literal injection harnesses and zero network-leaked hidden test cases.
   - Client-side browser execution fallback via **Pyodide** (WebAssembly Python) and Web Workers for zero-latency execution.
3. **Algorithmic Thought-Process Time-Lapse & Replay Engine:**
   - Micro-snapshot chronological session recording capturing edit deltas, test run transitions, line counts, and pass rates.
   - Interactive scrubbable Replay Player (`/replay/[id]`) allowing instructors and recruiters to observe a candidate's step-by-step algorithmic thought process.
4. **Interactive Logic Visualizer:**
   - Step-by-step memory, variable stack, and data structure execution tracer with active Monaco line synchronization.
5. **Subscription & Transaction Management:**
   - Monthly membership model (₹39/month) with **Razorpay** checkout integration.
   - Server-validated **Coupon Override System** (`BITBYBIT160`, `SAVE160`) reducing base pricing from ₹199 down to ₹39.
6. **Compliant Email Architecture (RFC 8058):**
   - High-deliverability transactional & promotional email dispatches via **Brevo API**.
   - Strict opt-out compliance with CAN-SPAM, GDPR, and RFC 8058 one-click list unsubscribe headers, alongside multi-table status syncing (`members`, `subscribers`, `email_unsubscribes`).
7. **Verifiable Credential & Certificate Generation:**
   - High-resolution vectorized PDF certificates generated via **jsPDF** with embedded cryptographic QR codes for public verification (`/certificate/[id]`).
8. **Dual-Theme Design System:**
   - Zero-AI-cliché, pristine Linear/Vercel-inspired UI with explicit semantic CSS custom variables supporting `[data-theme='light']` and `[data-theme='dark']`.

---

## 2. Repository Topology & Directory Mapping

The codebase is organized as a unified Next.js 14 App Router project located at `bit-by-bit-updated/`:

```
d:/bit-by-bit-v3 (1)/
├── .agent/                             # Token-optimized architectural blueprints
│   ├── 00-master-blueprint.md          # Core architecture, topology & engineering protocols
│   ├── 01-tech-stack-tokens.md         # Library versions, design tokens & theme variables
│   ├── 02-database-schema.md           # Supabase tables, columns, relations & RLS policies
│   ├── 03-backend-apis-actions.md      # Server actions, Next.js API routes & external services
│   ├── 04-frontend-components.md       # Workspace layouts, Monaco editor & UI components
│   └── 05-testing-refactoring-protocol.md # Testing, verification & refactoring directives
└── bit-by-bit-updated/                 # Primary Next.js Application Root
    ├── .agent/                         # Mirrored blueprint folder for repo root workflows
    ├── .env.example                    # Template environment variables
    ├── next.config.mjs                 # Next.js configuration & headers
    ├── package.json                    # Exact dependencies & build scripts
    ├── tailwind.config.ts              # Tailwind CSS tokens & extend declarations
    ├── tsconfig.json                   # Strict TypeScript compiler options
    ├── docs/                           # Internal architecture & design documentation
    ├── supabase/
    │   └── migrations/                 # PostgreSQL DDL migrations & RLS definitions
    │       ├── 20261001_certificates_schema.sql
    │       ├── 20261006_collaborations_schema.sql
    │       ├── 20261008_coupons_schema.sql
    │       ├── 20261013_email_unsubscribe_schema.sql
    │       └── 20261015_problem_timelines_schema.sql
    └── src/
        ├── app/                        # Next.js App Router (Layouts, Pages, APIs, Actions)
        │   ├── (app)/                  # Authenticated & public page routes
        │   │   ├── about/              # Organization & mission overview
        │   │   ├── admin/              # Admin console (coupons, users, challenges)
        │   │   ├── arena/              # Competitive arena & duel live test environment
        │   │   ├── certificate/        # Public certificate verification
        │   │   ├── collaborations/     # Partner universities & organizations
        │   │   ├── leaderboard/        # Global real-time ranking
        │   │   ├── problems/           # Problems catalog
        │   │   ├── profile/            # User profile, statistics, solved history
        │   │   ├── refunds/            # Legal refund & cancellation policy
        │   │   ├── replay/             # Algorithmic timeline replay player
        │   │   ├── subscribe/          # Razorpay monthly checkout & coupon input
        │   │   ├── terms/ & privacy/   # Legal terms of service & privacy policy
        │   │   └── weekly/             # Weekly challenge dashboard
        │   ├── actions/                # Server actions ("use server")
        │   │   ├── coupons.ts          # Coupon validation, creation, deletion
        │   │   └── unsubscribe.ts      # Multi-table email unsubscribe & resubscribe
        │   ├── api/                    # Server-side API endpoints
        │   │   ├── admin/              # Privileged administrative operations
        │   │   ├── ai/                 # Groq LLM endpoint (llama-3.3-70b-versatile)
        │   │   ├── auth/               # Supabase session handlers
        │   │   ├── certificates/       # PDF generation & validation
        │   │   ├── collaborations/     # Collaborations content endpoint
        │   │   ├── contest/            # Contest management & timer APIs
        │   │   ├── coupons/validate/   # Coupon validation endpoint
        │   │   ├── execute/            # Judge0 isolated code runner with hidden tests
        │   │   ├── notify/             # Admin broadcast notifications
        │   │   ├── problems/           # Problem CRUD & test case ingestion
        │   │   ├── razorpay/           # Orders, verification & webhook handlers
        │   │   ├── timeline/           # Problem snapshot capture & retrieval
        │   │   ├── unsubscribe/        # RFC 8058 one-click unsubscribe endpoint
        │   │   └── visualize/          # AST and code execution instrumentation
        │   ├── globals.css             # Dual-theme tokens & component utility classes
        │   ├── layout.tsx              # Root HTML wrapper with Syne/JetBrains fonts
        │   ├── page.tsx                # Landing & home page
        │   ├── problems/               # Standalone full-screen problem workspace
        │   └── unsubscribe/            # Dedicated one-click email opt-out landing page
        ├── components/                 # Reusable React UI components
        │   ├── admin/                  # Admin management dashboards
        │   ├── arena/                  # Strike indicator, anti-cheat & duel submission dialogs
        │   ├── certificates/           # Vectorized preview & download cards
        │   ├── code-editor/            # Monaco editor, LangTabs, test runner
        │   ├── collaborations/         # University partnerships & contact forms
        │   ├── layout/                 # AppShell, AppShellContext, TopBar, SideBar
        │   ├── pages/                  # Route-level page implementations
        │   ├── problem/                # Markdown problem descriptions, hints, tags
        │   ├── ui/                     # Cards, buttons, modals, spotlights
        │   └── workspace/              # ReplayPlayer, scrubber, playback controls
        ├── lib/                        # Business logic & infrastructure clients
        │   ├── browserExecutor.ts      # In-browser JS & Pyodide fallback execution
        │   ├── email.ts                # Brevo API client with RFC 8058 headers & footers
        │   ├── executor.ts             # Judge0 multi-language compiler & test batcher
        │   ├── gemini.ts               # Groq & Ollama AI tutor routing & rate limits
        │   ├── leetCodeHarness.ts      # Native type parser & code injection harness
        │   ├── razorpay.ts             # Order signing, HMAC verification & client setup
        │   ├── streak.ts               # Daily problem streak calculator
        │   ├── subscription.ts         # User entitlement check & period calculator
        │   ├── supabase.ts             # Supabase client (anon + service role)
        │   ├── timelineCapture.ts      # Workspace snapshot recorder
        │   └── visualizer.ts           # Execution frame step analyzer
        └── types/                      # TypeScript declarations & database interfaces
            ├── collaborations.ts       # Collaboration page types
            ├── coupons.ts              # Coupon domain types & validation responses
            └── database.ts             # Master database types & supported languages
```

---

## 3. Production Safeguards & Engineering Directives

All contributors and AI agents operating on this codebase must strictly adhere to the following architectural guardrails:

### Directive 1: Spec-Driven Development (Token & Context Preservation)
- **Read Before Write:** Always inspect the corresponding `.agent/` blueprint before modifying source code.
- **Surgical Edits:** Avoid broad rewrites of large components. Target isolated subroutines and maintain modularity.
- **Synchronized Blueprints:** Any schema migration, new API endpoint, or design system token must be documented in `.agent/`.

### Directive 2: Database Migration & RLS Isolation
- **Immutable Migration History:** Never alter existing production migration SQL files (`supabase/migrations/*.sql`). Always create a new timestamped migration file (e.g. `YYYYMMDD_feature_name.sql`).
- **Account Isolation:** Every table storing user data or financial records (`members`, `subscribers`, `contest_registrations`, `certificates`, `problem_timelines`) must enforce Row Level Security (RLS) ensuring strict account isolation. Anonymous/public writes to billing and auth tables are prohibited.

### Directive 3: Local Service Resilience (Ollama & Judge0 via Cloudflare Tunnel)
- **Tunnel Resilience:** When Judge0 (`JUDGE0_URL`) or Ollama (`NEXT_PUBLIC_OLLAMA_URL`) are exposed through Cloudflare Tunnels (`*.trycloudflare.com` or custom domains), network fluctuations can cause latency spikes.
- **Strict Timeouts:** All fetch requests must implement abort controllers with bounded timeouts (e.g., 12s for Groq/Ollama, 15s for Judge0).
- **Graceful Fallbacks:** If the tunnel or container is unreachable, the system must degrade gracefully (fallback to in-browser Pyodide for Python/JS, fallback to Ollama if Groq is rate-limited, friendly toast alerts without app crashes).

### Directive 4: Frontend Performance Budgets
- **Dynamic Client Imports:** All heavy, browser-only client components must be loaded dynamically using Next.js `dynamic(..., { ssr: false })`:
  - Monaco Editor (`@monaco-editor/react`)
  - Logic Visualizer Drawer (`LogicVisualizerDrawer.tsx`)
  - Replay Timeline Player (`ReplayPlayer.tsx`)
  - Arena Duel Telemetry Panes
- **Bundle Protection:** Prevent heavy syntax highlighter engines or AST parsers from ballooning the initial SSR HTML payload, preserving fast Largest Contentful Paint (LCP) and Lighthouse scores.

### Directive 5: Zero AI Clichés & Strict Dual-Themes
- **No Vibecoding Clichés:** Do not introduce generic neon gradient cards, purplish mesh blobs, or unstyled default HTML elements.
- **Restrained Linear/Vercel Aesthetic:** High-contrast surfaces, 1px ultra-fine borders (`border-slate-200/80` in light mode, `border-white/6` in dark mode), and electric cyan (`#00E5FF`) accents.
- **Theme Integrity:** Every element must look clean in both light (`[data-theme='light']`) and dark (`[data-theme='dark']`) modes with zero hardcoded color leaks.

---

## 4. Model Allocation & Strategy Matrix

| Tier | Model Category | Target Workloads |
| :--- | :--- | :--- |
| **Tier 1: Fast / Lightweight** | Fast Models (e.g. Gemini 3.8 Flash, Claude 3.5 Haiku, GPT-4o-mini) | • Boilerplate code generation & scaffolding<br>• Markdown documentation & `.agent/` blueprint synchronization<br>• Tailwind CSS class refactoring & responsive layout fixes<br>• Simple CRUD UI components, prop typing & icon updates |
| **Tier 2: High-Reasoning / Advanced** | Advanced Models (e.g. Gemini Pro, Claude 3.7 Sonnet, GPT-4o) | • Complex PostgreSQL migrations & RLS security policy authoring<br>• Multi-language test harness compilation & AST visualizer instrumentation<br>• Concurrency bug fixing (payment race conditions, subscription stacking)<br>• Code Duel real-time state, anti-cheat detection, and RFC 8058 compliance |
