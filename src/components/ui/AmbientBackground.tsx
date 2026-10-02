'use client';
import React from 'react';

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* Dynamic Aurora Blobs */}
      <div className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-indigo-600/10 blur-[140px] animate-aurora-1" />
      <div className="absolute top-[30%] -right-[15%] w-[60vw] h-[60vw] rounded-full bg-purple-600/10 blur-[160px] animate-aurora-2" />
      <div className="absolute -bottom-[20%] left-[20%] w-[65vw] h-[65vw] rounded-full bg-sky-600/08 blur-[150px] animate-aurora-3" />

      {/* Subtle Coordinate Grid with Radial Vignette */}
      <div className="absolute inset-0 bg-dot-grid opacity-25 [mask-image:radial-gradient(ellipse_80%_80%_at_50%_40%,#000_30%,transparent_100%)]" />
    </div>
  );
}
