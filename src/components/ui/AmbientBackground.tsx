'use client';
import React from 'react';

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      <div className="absolute -top-[15%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-slate-200/40 dark:bg-sky-950/20 blur-[130px] animate-aurora-1" />
      <div className="absolute top-[35%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-sky-100/50 dark:bg-slate-900/30 blur-[140px] animate-aurora-2" />
      <div className="absolute -bottom-[15%] left-[25%] w-[50vw] h-[50vw] rounded-full bg-slate-200/30 dark:bg-slate-950/40 blur-[140px] animate-aurora-3" />
      <div className="absolute inset-0 bg-dot-grid opacity-30 dark:opacity-20 [mask-image:radial-gradient(ellipse_80%_80%_at_50%_40%,#000_30%,transparent_100%)]" />
    </div>
  );
}
