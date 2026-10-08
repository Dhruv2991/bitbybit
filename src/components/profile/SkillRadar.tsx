'use client';
// ════════════════════════════════════════════════════════════
// src/components/profile/SkillRadar.tsx
// Clean, high-density developer skill competency breakdown
// ════════════════════════════════════════════════════════════
import { useMemo } from 'react';
import { Target } from 'lucide-react';

interface Props {
  skills: { tag: string; count: number }[];
}

const SIZE = 210;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 32;

export default function SkillRadar({ skills }: Props) {
  const { points, maxCount, topDomain } = useMemo(() => {
    if (skills.length < 3) {
      return { points: null, maxCount: 0, topDomain: null };
    }
    const max = Math.max(...skills.map((s) => s.count), 1);
    const n = skills.length;
    const pts = skills.map((s, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const ratio = s.count / max;
      const r = RADIUS * Math.max(ratio, 0.12);
      return {
        tag: s.tag,
        count: s.count,
        percent: Math.round((s.count / max) * 100),
        x: CENTER + r * Math.cos(angle),
        y: CENTER + r * Math.sin(angle),
        labelX: CENTER + (RADIUS + 20) * Math.cos(angle),
        labelY: CENTER + (RADIUS + 20) * Math.sin(angle),
      };
    });

    const top = [...skills].sort((a, b) => b.count - a.count)[0];

    return {
      points: pts,
      maxCount: max,
      topDomain: top,
    };
  }, [skills]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 backdrop-blur-xl p-5 transition-all duration-200 hover:border-slate-300 dark:hover:border-zinc-700/80 flex flex-col justify-between h-full shadow-xs">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/70 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Skill Breakdown</h2>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-500">
                {skills.length >= 3 ? `${skills.length} categories analyzed` : 'Needs more data'}
              </p>
            </div>
          </div>

          {topDomain && (
            <div className="text-right">
              <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 uppercase block">Top Area</span>
              <span className="text-xs font-mono font-medium text-cyan-600 dark:text-cyan-400">{topDomain.tag}</span>
            </div>
          )}
        </div>

        {/* Chart View / Empty State */}
        {!points ? (
          <div className="py-10 flex flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-mono text-slate-700 dark:text-zinc-300 font-medium mb-1">
              Solve problems across 3+ topic tags
            </p>
            <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 max-w-xs">
              Complete more problems to generate your personalized skill radar chart.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center my-1">
            <svg
              width={SIZE + 40}
              height={SIZE + 10}
              viewBox={`-20 -5 ${SIZE + 40} ${SIZE + 10}`}
              className="overflow-visible"
            >
              {/* Concentric rings */}
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <circle
                  key={f}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS * f}
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-zinc-800"
                  strokeWidth={1}
                />
              ))}

              {/* Axis spokes */}
              {points.map((p, i) => {
                const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
                const x = CENTER + RADIUS * Math.cos(angle);
                const y = CENTER + RADIUS * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={CENTER}
                    y1={CENTER}
                    x2={x}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-zinc-800"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Data Polygon */}
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(6, 182, 212, 0.15)"
                stroke="#06b6d4"
                strokeWidth={1.5}
              />

              {/* Vertex Dots */}
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#06b6d4" />
              ))}

              {/* Labels */}
              {points.map((p, i) => (
                <text
                  key={i}
                  x={p.labelX}
                  y={p.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-600 dark:fill-zinc-400 font-mono text-[10px] font-medium"
                >
                  {p.tag}
                </text>
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Domain Breakdown Bars */}
      {skills.length > 0 && (
        <div className="pt-3 mt-2 border-t border-slate-100 dark:border-zinc-800/70">
          <div className="grid grid-cols-2 gap-2">
            {skills.slice(0, 4).map((s) => {
              const pct = maxCount > 0 ? Math.round((s.count / maxCount) * 100) : 0;
              return (
                <div
                  key={s.tag}
                  className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 rounded-lg p-2 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-700 dark:text-zinc-300 truncate max-w-[85px]">{s.tag}</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{s.count} solves</span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
