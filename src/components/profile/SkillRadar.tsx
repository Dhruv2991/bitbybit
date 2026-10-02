'use client';
// ════════════════════════════════════════════════════════════
// src/components/profile/SkillRadar.tsx
// Spider/radar chart of solved-problem tags — pure SVG, no chart
// library dependency. Needs at least 3 distinct tags to draw a
// meaningful shape; falls back to a friendly empty state otherwise.
// ════════════════════════════════════════════════════════════
import { useMemo } from 'react';

interface Props {
  skills: { tag: string; count: number }[];
}

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 36;

export default function SkillRadar({ skills }: Props) {
  const points = useMemo(() => {
    if (skills.length < 3) return null;
    const max = Math.max(...skills.map(s => s.count));
    const n = skills.length;
    return skills.map((s, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const ratio = max > 0 ? s.count / max : 0;
      const r = RADIUS * Math.max(ratio, 0.08); // tiny floor so a 0 still shows a dot, not nothing
      return {
        tag: s.tag,
        count: s.count,
        x: CENTER + r * Math.cos(angle),
        y: CENTER + r * Math.sin(angle),
        labelX: CENTER + (RADIUS + 22) * Math.cos(angle),
        labelY: CENTER + (RADIUS + 22) * Math.sin(angle),
      };
    });
  }, [skills]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 mb-6">
      <h2 className="font-semibold text-sm text-zinc-100 mb-4">Skill breakdown</h2>

      {!points ? (
        <div className="text-center py-10 text-zinc-500 font-mono text-xs">
          Solve a few more problems across different topics to unlock your skill radar.
        </div>
      ) : (
        <div className="flex justify-center">
          <svg width={SIZE + 60} height={SIZE + 20} viewBox={`-30 -10 ${SIZE + 60} ${SIZE + 20}`}>
            {/* Grid rings */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <circle key={f} cx={CENTER} cy={CENTER} r={RADIUS * f} fill="none" stroke="#27272a" strokeWidth={1} />
            ))}
            {/* Axis lines */}
            {points.map((p, i) => {
              const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
              const x = CENTER + RADIUS * Math.cos(angle);
              const y = CENTER + RADIUS * Math.sin(angle);
              return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#27272a" strokeWidth={1} />;
            })}
            {/* Data polygon */}
            <polygon
              points={points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="rgba(99, 102, 241, 0.15)"
              stroke="#6366f1"
              strokeWidth={1.5}
            />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" />
            ))}
            {/* Labels */}
            {points.map((p, i) => (
              <text
                key={i}
                x={p.labelX}
                y={p.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fontFamily="inherit"
                className="fill-zinc-400 font-mono"
              >
                {p.tag} ({p.count})
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
