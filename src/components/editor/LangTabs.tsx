'use client';
// ════════════════════════════════════════════════════════════
// src/components/editor/LangTabs.tsx
// ════════════════════════════════════════════════════════════

import type { SupportedLang } from '@/types/database';

const LANGS: { id: SupportedLang; label: string; icon: string }[] = [
  { id: 'python',     label: 'Python',     icon: '🐍' },
  { id: 'javascript', label: 'JavaScript', icon: '⚡' },
  { id: 'cpp',        label: 'C++',        icon: '⚙️' },
  { id: 'java',       label: 'Java',       icon: '☕' },
  { id: 'rust',       label: 'Rust',       icon: '🦀' },
  { id: 'go',         label: 'Go',         icon: '🐹' },
];

interface LangTabsProps {
  current:  SupportedLang;
  onChange: (lang: SupportedLang) => void;
}

export default function LangTabs({ current, onChange }: LangTabsProps) {
  return (
    <div className="flex gap-1 flex-wrap bg-[#111] border border-[#1f1f1f] rounded-lg p-1 w-fit">
      {LANGS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-mono font-medium
            transition-all duration-200
            ${current === id
              ? 'bg-[#00e87a] text-black'
              : 'text-[#666] hover:text-[#e0e0e0] hover:bg-[#1a1a1a]'}
          `}
        >
          <span className="text-xs">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
