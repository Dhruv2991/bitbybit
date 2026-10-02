"use client";

/**
 * AnimatedBackground.tsx
 * Live Ambient & Atmospheric Background (Antigravity System)
 * Fixed, GPU-accelerated slow-drifting aurora blobs + radial-masked dot matrix grid.
 * Fully theme-aware with radiant glow in light mode and deep cosmic aurora in dark mode.
 */
export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
      {/* ── Dark Theme Aurora Blobs ────────────────────────────────────────── */}
      <div className="absolute -top-[20%] -left-[10%] w-[65vw] h-[65vw] rounded-full bg-cyan-950/30 blur-[150px] animate-aurora-1" />
      <div className="absolute top-[30%] -right-[15%] w-[55vw] h-[55vw] rounded-full bg-cyan-900/20 blur-[170px] animate-aurora-2" />
      <div className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] rounded-full bg-slate-900/35 blur-[160px] animate-aurora-3" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/40 to-zinc-950/80" />

      {/* ── Dot-Matrix Coordinate Pattern with Radial Edge Fade ─────────────── */}
      <div className="absolute inset-0 bg-dot-grid opacity-25 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_35%,#000_25%,transparent_100%)]" />
    </div>
  );
}
