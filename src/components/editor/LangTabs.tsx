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
              flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 rounded-xl
              text-xs font-mono font-medium transition-all duration-150 border
              ${isActive
                ? 'bg-[#00e87a15] text-[#00e87a] border-[#00e87a30] font-bold'
                : 'bg-[#0d0d0d] text-[#555] border-[#1a1a1a] hover:text-[#e0e0e0] hover:border-[#2a2a2a] hover:bg-[#161616]'}
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