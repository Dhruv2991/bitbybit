'use client';

import type { SupportedLang } from '@/types/database';

const LANGS: { id: SupportedLang; label: string; icon: string; color: string }[] = [
  { id: 'python',     label: 'Python',     icon: '🐍', color: '#3572A5' },
  { id: 'javascript', label: 'JavaScript', icon: '⚡', color: '#f7df1e' },
  { id: 'cpp',        label: 'C++',        icon: '⚙️', color: '#f34b7d' },
  { id: 'java',       label: 'Java',       icon: '☕', color: '#b07219' },
  { id: 'rust',       label: 'Rust',       icon: '🦀', color: '#dea584' },
  { id: 'go',         label: 'Go',         icon: '🐹', color: '#00ADD8' },
];

interface LangTabsProps {
  current:  SupportedLang;
  onChange: (lang: SupportedLang) => void;
  allowedLangs?: SupportedLang[];
}

export default function LangTabs({ current, onChange, allowedLangs }: LangTabsProps) {
  const visibleLangs = allowedLangs ? LANGS.filter(l => allowedLangs.includes(l.id)) : LANGS;
  return (
    <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:flex-wrap sm:gap-1.5">
      {visibleLangs.map(({ id, label, icon }) => {
        const isActive = current === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`
              flex items-center justify-center sm:justify-start gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-mono font-medium transition-all duration-150 border
              ${isActive
                ? 'bg-slate-900 text-white border-slate-800 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 font-semibold shadow-xs'
                : 'bg-slate-100/70 text-slate-600 border-slate-200 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-100 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-800/80 dark:hover:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40'}
            `}
          >
            <span className="text-sm leading-none">{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
