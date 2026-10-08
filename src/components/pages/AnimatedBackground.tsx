"use client";

/**
 * AnimatedBackground.tsx
 * Precision Ambient Developer Canvas (Linear / Vercel Aesthetic)
 * Restrained subtle ambient drift + radial-masked coordinate grid.
 * Fully theme-adaptive: clean neutral off-white in Light Mode, deep matte cosmic slate in Dark Mode.
 */
export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
      {/* ── Ambient Radial Atmosphere (Light & Dark Adaptive) ── */}
      <div className="absolute -top-[15%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-slate-200/40 dark:bg-sky-950/20 blur-[130px] animate-aurora-1" />
      <div className="absolute top-[35%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-sky-100/50 dark:bg-slate-900/30 blur-[140px] animate-aurora-2" />
      <div className="absolute -bottom-[15%] left-[25%] w-[50vw] h-[50vw] rounded-full bg-slate-200/30 dark:bg-slate-950/40 blur-[140px] animate-aurora-3" />

      {/* ── Clean Coordinate Grid with Radial Vignette ── */}
      <div className="absolute inset-0 bg-dot-grid opacity-30 dark:opacity-20 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_35%,#000_25%,transparent_100%)]" />
    </div>
  );
}
