"use client";

/**
 * Fixed, pointer-events-none animated background.
 * Pure CSS (transform + opacity only) so it's cheap to run and doesn't
 * fight with scrolling or interaction anywhere in the app.
 * Colors/opacity adapt automatically to light/dark via globals.css.
 */
export default function AnimatedBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-blob aurora-blob--a" />
      <div className="aurora-blob aurora-blob--b" />
      <div className="aurora-blob aurora-blob--c" />
      <div className="aurora-grid" />
      <div className="aurora-vignette" />
    </div>
  );
}
