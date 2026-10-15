# BitByBit — Tech Stack & Design Tokens Specification

> **Specification Version:** 1.0.0  
> **Target Directory:** `.agent/01-tech-stack-tokens.md`  
> **Source of Truth:** `package.json`, `tailwind.config.ts`, `src/app/globals.css`

---

## 1. Exact Library Versions & Dependencies

```json
{
  "name": "bitbybit",
  "version": "1.0.0",
  "framework": "Next.js 14.2.3 (App Router)",
  "runtime": "Node.js 18+ / 20+",
  "styling": "Tailwind CSS 3.4.1 + CSS Variables",
  "language": "TypeScript 5.x",
  "core_dependencies": {
    "next": "^14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "@supabase/supabase-js": "^2.43.1",
    "@supabase/ssr": "^0.3.0",
    "@monaco-editor/react": "^4.6.0",
    "razorpay": "^2.9.6",
    "jspdf": "^2.5.1",
    "qrcode": "^1.5.3",
    "dompurify": "^3.1.6",
    "lucide-react": "^0.383.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0",
    "axios": "^1.6.8",
    "sharp": "^0.35.5",
    "@vercel/analytics": "^1.3.1"
  },
  "dev_dependencies": {
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10.0.1",
    "eslint": "^8",
    "eslint-config-next": "14.2.3",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/qrcode": "^1.5.5",
    "@types/dompurify": "^3.0.5"
  }
}
```

---

## 2. Typography & Fonts

BitByBit uses a deliberate two-font typography system loaded in `src/app/layout.tsx`:
1. **Headings & Display (`font-display`):** `Syne`, sans-serif
   - Applied to `h1`, `h2`, `h3`, `h4`, `h5`, `h6` with `letter-spacing: -0.02em`.
   - Scale:
     - `h1`: `1.875rem` (30px), `line-height: 1.25`
     - `h2`: `1.5rem` (24px), `line-height: 1.3`
     - `h3`: `1.25rem` (20px), `line-height: 1.35`
2. **Body & Code (`font-mono`):** `JetBrains Mono`, `Fira Code`, `Cascadia Code`, monospace
   - Default base font for the entire app body (`letter-spacing: -0.01em`, `line-height: 1.6`).
   - Standard monospace font for the Monaco editor (`fontSize: 15.5`, `lineHeight: 24`, font ligatures enabled).

---

## 3. Dual-Theme Variable Tokens Specification

BitByBit employs CSS Custom Properties with automatic theme synchronization. The theme is applied to `:root` via `data-theme="light"` or `data-theme="dark"` (and synced to the Tailwind `.dark` class).

### Canvas & Surface Structure

| Token | Light Theme (`data-theme='light'`) | Dark Theme (`data-theme='dark'`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg` | `#f8fafc` (slate-50 off-white) | `#08090d` (matte slate/zinc black) | Application canvas background |
| `--surface` | `rgba(255, 255, 255, 0.90)` | `rgba(15, 23, 42, 0.65)` | Backdrop navigation & toolbars |
| `--card` | `rgba(255, 255, 255, 0.95)` | `rgba(15, 23, 42, 0.45)` | Standard card background |
| `--card-hover`| `#ffffff` | `rgba(30, 41, 59, 0.5)` | Card hover state |
| `--border` | `rgba(15, 23, 42, 0.08)` | `rgba(255, 255, 255, 0.06)` | Structural 1px separation lines |
| `--border2` | `rgba(15, 23, 42, 0.12)` | `rgba(255, 255, 255, 0.10)` | Medium emphasis border lines |

### Brand & Accent Colors

| Token | Light Theme (`data-theme='light'`) | Dark Theme (`data-theme='dark'`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--acc` | `#0284c7` (sky-600 tech cyan) | `#00E5FF` (electric cyan) | Primary action & brand highlight |
| `--acc-hover`| `#0369a1` (sky-700) | `#22d3ee` (cyan-400) | Hover accent state |
| `--acc-dim` | `rgba(2, 132, 199, 0.08)` | `rgba(0, 229, 255, 0.10)` | Translucent badge / focus fill |
| `--acc-glow` | `rgba(2, 132, 199, 0.12)` | `rgba(0, 229, 255, 0.15)` | Subtle focus / card glow |
| `--acc-2` | `#0ea5e9` (sky-500) | `#38bdf8` (sky-400) | Secondary action highlight |

### Semantic Status Indicators

| Token | Light Theme Value | Dark Theme Value | Usage |
| :--- | :--- | :--- | :--- |
| `--success` / `--success-dim` | `#059669` / `rgba(5, 150, 105, 0.08)` | `#10b981` / `rgba(16, 185, 129, 0.1)` | Test passed, active streak |
| `--warn` / `--warn-dim` | `#d97706` / `rgba(217, 119, 6, 0.08)` | `#f59e0b` / `rgba(245, 158, 11, 0.1)` | Medium difficulty, pending payment |
| `--danger` / `--danger-dim` | `#e11d48` / `rgba(225, 29, 72, 0.08)` | `#f43f5e` / `rgba(244, 63, 94, 0.1)` | Test failed, arena strike |
| `--purple` / `--purple-dim` | `#9333ea` / `rgba(147, 51, 234, 0.08)` | `#a855f7` / `rgba(168, 85, 247, 0.1)` | AI suggestions, weekly challenge |
| `--info` / `--info-dim` | `#0284c7` / `rgba(2, 132, 199, 0.08)` | `#38bdf8` / `rgba(56, 189, 248, 0.1)` | Toast informational notices |

### Text Hierarchy

| Token | Light Theme Value | Dark Theme Value | Application |
| :--- | :--- | :--- | :--- |
| `--text` | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | High-contrast body & titles |
| `--text2` | `#475569` (slate-600) | `#94a3b8` (slate-400) | Subtitles & secondary labels |
| `--muted` | `#64748b` (slate-500) | `#94a3b8` (slate-400) | Inactive tabs, icons |
| `--muted2` | `#94a3b8` (slate-400) | `#64748b` (slate-500) | Table footers, timestamps |

### Layout Dimensions & Elevation

- `--sidebar-w`: `260px` (Expanded)
- `--sidebar-w-collapsed`: `72px`
- `--topbar-h`: `56px`
- Elevation Shadows:
  - `--shadow-sm`: `0 1px 3px rgba(15, 23, 42, 0.05)` (Light) / `0 1px 2px rgba(0,0,0,0.4)` (Dark)
  - `--shadow-md`: `0 4px 6px -1px rgba(15, 23, 42, 0.05)` (Light) / `0 4px 20px rgba(0,0,0,0.5)` (Dark)
  - `--shadow-lg`: `0 10px 15px -3px rgba(15, 23, 42, 0.06)` (Light) / `0 16px 45px rgba(0,0,0,0.6)` (Dark)

---

## 4. Predefined Utility & Component Classes

To avoid ad-hoc utility clutter, the following classes defined in `@layer components` of `globals.css` must be used across all templates:

### Buttons
- `.btn-primary`: High-precision gradient action button. Cyan-to-sky gradient, font-mono, active scale `0.98`.
- `.btn-secondary`: Clean neutral button with subtle border and crisp background.
- `.btn-ghost`: Borderless, lightweight icon or action button with hover background.

### Cards & Badges
- `.card`: Glassmorphic container with `backdrop-blur-xl`, fine border, and `--shadow-sm`.
- `.card-hover`: Card with interactive border and background transition.
- `.card-glow`: Card with accent hover border (`hover:border-cyan-500/30`).
- `.input-base`: Standard form field with focus ring and font-mono text.
- `.diff-easy`, `.diff-medium`, `.diff-hard`: Standard difficulty chips with background tints.
- `.badge-live`, `.badge-upcoming`, `.badge-ended`: Status pills for contests.

### Monaco Editor Active Trace Overrides
- `.monaco-viz-active-line`: Highlight band (`background: rgba(0, 229, 255, 0.15) !important`, `border-left: 3px solid #00E5FF !important`) applied during step-by-step logic visualization.
- Standard transparent input overrides to prevent browser cursor and outline collision with Monaco canvas.
