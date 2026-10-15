# BitByBit — Frontend Components & Workspace Architecture

> **Specification Version:** 1.0.0  
> **Target Directory:** `.agent/04-frontend-components.md`  
> **Source of Truth:** `src/components/*`, `src/app/problems/Workspace.tsx`, `src/components/layout/*`

---

## 1. Application Layout & Shell Architecture

The user interface is governed by `AppShell` and `AppShellContext`, providing unified navigation, user session persistence, theme transitions, and live state polling.

### 1. `AppShellContext` (`src/components/layout/AppShellContext.tsx`)
- **State Management:**
  - `user: User | null`: Stores current user (`name`, `github`, `is_admin`, `is_subscriber`).
  - `theme: 'dark' | 'light'`: Manages dual-theme state with persistent storage in `localStorage.getItem('bb_theme')` and DOM synchronization on `<html data-theme="...">`.
  - `toasts: Toast[]`: Global notification queue with automatic dismissal.
  - `arenaLocked: boolean`: Blocks navigation and enforces strict full-screen mode during proctored arena competitions.
  - `liveItems: LiveItem[]`: Polled background list of live contests and active weekly challenges.
  - `userStreak: number`: Solved problem streak badge counter.
- **Routing Harmonization:**
  - Translates Next.js App Router paths (`/`, `/problems`, `/arena`, `/profile`, `/subscribe`, `/admin`, `/collaborations`, `/unsubscribe`) to legacy internal `PageId` tokens (`ROUTE_TO_PAGE` / `PAGE_TO_ROUTE`) to preserve backwards compatibility.

### 2. `AppShell` (`src/components/layout/AppShell.tsx`)
- **Global Frame:**
  - Responsive collapsible sidebar (`260px` expanded, `72px` collapsed).
  - Modern glassmorphic TopBar (`56px` height) with global search trigger, theme toggle, streak indicator, and user avatar dropdown.
  - Built-in `GlobalSearch` modal for instantaneous problem search by title, difficulty, and tag.

---

## 2. Core Problem Workspace (`src/app/problems/Workspace.tsx`)

The main problem-solving environment is a high-performance, multi-panel interactive IDE designed to mimic real-world engineering assessment platforms.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TopBar: Back, Problem Title, Difficulty Chip, Points, Run (⌘⏎), Submit (⇧⌘⏎) │
├──────────────────────────────────────┬────────────────────────────────────────┤
│ LEFT PANEL                           │ RIGHT PANEL                            │
│ ┌──────────────────────────────────┐ │ ┌────────────────────────────────────┐ │
│ │ Tabs: [Description | Hints |     │ │ │ LangTabs: [Python, JS, C++, Java,  │ │
│ │        Submissions | Timeline]   │ │ │            Rust, Go]               │ │
│ ├──────────────────────────────────┤ │ ├────────────────────────────────────┤ │
│ │ • Markdown Problem Description   │ │ │ Monaco Code Editor                 │ │
│ │ • Parameter & Return Spec        │ │ │ (Font: JetBrains Mono, 15.5px)     │ │
│ │ • Example Test Cases             │ │ │                                    │ │
│ │ • Starter Templates              │ │ ├────────────────────────────────────┤ │
│ │ • Hint Revealer                  │ │ │ Bottom Tabs: [Test Cases | Results]│ │
│ │                                  │ │ │ • Input / Expected / Actual        │ │
│ │                                  │ │ │ • Visualizer / Replay Trigger      │ │
│ └──────────────────────────────────┘ │ └────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Key Workspace Features:
1. **Interactive Language Switching:** `LangTabs` automatically transitions starter code signatures across Python, JavaScript, C++, Java, Rust, and Go while preserving user drafts in local storage.
2. **Keyboard Accelerators:**
   - `Ctrl/Cmd + Enter`: Trigger sample test run.
   - `Ctrl/Cmd + Shift + Enter`: Submit solution against authoritative hidden test suite.
   - `Ctrl/Cmd + S`: Trigger document formatting inside Monaco.
3. **Execution Pipeline:**
   - Triggers server-side `/api/execute` with authoritative test cases.
   - Updates `TestResults` component with execution time, stdout, pass/fail status, and sanitized hidden test cards.
4. **Automated Timeline Recorder:**
   - Silently captures code snapshots upon character edits, language swaps, and test runs via `src/lib/timelineCapture.ts`.
   - Compresses and transmits session history to `/api/timeline/save` upon successful problem submission.

---

## 3. Monaco Editor Integration (`src/components/code-editor/CodeEditor.tsx`)

The Monaco Editor is wrapped with customized styling and direct theme synchronization:

- **Theme Dynamic Binding:**
  - Listens to DOM theme mutations on `document.documentElement` (`attributeFilter: ['class', 'data-theme']`).
  - Dynamically swaps Monaco between `'vs-dark'` and `'vs'` themes.
- **Visualizer Active-Line Highlight:**
  - Accepts `activeLine?: number | null`.
  - Injects Monaco delta decorations (`monaco-viz-active-line`) with electric cyan left borders (`3px solid #00E5FF`) and translucent background bands.
  - Automatically centers viewport on active executing line (`revealLineInCenterIfOutsideViewport`).
- **Input Sanitization:**
  - Global CSS rules strip browser default outline, caret, and focus borders from Monaco textareas to maintain a clean UI.

---

## 4. Algorithmic Replay & Visualizer Components

### 1. `ReplayPlayer` (`src/components/workspace/ReplayPlayer.tsx`)
- **Interactive Scrubber:** Timeline slider allowing scrub-through of every recorded snapshot with millisecond-precision timestamps.
- **Playback Controls:** Play, pause, restart, and speed multipliers (`1x`, `2x`, `5x`, `10x`).
- **Delta Forensics:** Shows character additions, line changes, and active test pass rates at every stage of the candidate's implementation.

### 2. `LogicVisualizerDrawer` (`src/components/code-editor/LogicVisualizerDrawer.tsx`)
- **Step-by-Step Tracer:** Executes code in an instrumented AST sandbox (`src/lib/visualizerInstrumenter.ts`).
- **Interactive Visualizations:**
  - Array / Matrix grid representations with active index pointers.
  - Linked list node chains and binary tree node hierarchies.
  - Variable call stack and local scope watches.

---

## 5. Reusable Component Kit

- **`SpotlightCard` (`src/components/ui/SpotlightCard.tsx`):** Card with radial cursor spotlight effect.
- **`AmbientBackground` (`src/components/ui/AmbientBackground.tsx`):** Restrained, low-contrast structural dot-grid backdrop (`.bg-dot-grid`).
- **`GlobalSearch` (`src/components/GlobalSearch.tsx`):** Fast fuzzy search modal with keyboard navigation (`↑`/`↓`/`Enter`).
- **`ProblemDescription` (`src/components/problem/ProblemDescription.tsx`):** High-contrast markdown renderer with sanitized examples, parameter tables, and hint accordions.

---

## 6. Real-Time 1v1 Code Duel Components

### 1. `DuelsLobbyPage` (`src/components/pages/DuelsLobbyPage.tsx`)
- Match creation dashboard with problem selector, duration pills (15m, 30m, 45m), and open room list.
- Supabase Realtime channel listener (`duels-lobby-realtime`) updating active waiting rooms dynamically.

### 2. `DuelWarRoomPage` (`src/app/duel/[roomId]/page.tsx`)
- Full-screen split combat layout:
  - Left: Problem specifications, markdown constraints, live execution output.
  - Right: Floating Telemetry HUD showing opponent's progress bar, test pass rates, active player status badge (`coding`, `running_tests`, `submitted`), and dynamically imported Monaco code editor.
- Synchronized countdown timer bound to room `started_at` timestamp.
- Victory / Defeat Modal with final stats breakdown, winner declaration, and rematch actions.
