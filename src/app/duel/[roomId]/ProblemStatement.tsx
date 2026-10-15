'use client';
// ════════════════════════════════════════════════════════════
// src/app/duel/[roomId]/ProblemStatement.tsx
// Rich Markdown & HTML Problem Statement Renderer with
// Tailwind typography (prose dark:prose-invert max-w-none text-sm)
// and container constraints to prevent overflow or truncation.
// ════════════════════════════════════════════════════════════

import React from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

function renderInlineTokens(text: string): React.ReactNode {
  const tokenRegex = /(!\[([^\]]*)\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\)|<img\s+[^>]*src=["']([^"']+)["'][^>]*>)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];

    // Markdown Image: ![alt](url)
    if (token.startsWith('![') && token.includes('](')) {
      const altText = match[2] || 'Problem illustration';
      const srcUrl = (match[3] || '').split(/\s+/)[0];
      parts.push(
        <img
          key={`inline-img-${match.index}`}
          src={srcUrl}
          alt={altText}
          className="max-w-full max-h-[360px] object-contain rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 my-3 mx-auto block shadow-xs"
        />
      );
    }
    // HTML Image tag: <img src="..." />
    else if (token.toLowerCase().startsWith('<img')) {
      const srcMatch = token.match(/src=["']([^"']+)["']/i);
      const altMatch = token.match(/alt=["']([^"']*)["']/i);
      const src = srcMatch ? srcMatch[1] : '';
      const alt = altMatch ? altMatch[1] : 'Problem illustration';
      parts.push(
        <img
          key={`inline-html-img-${match.index}`}
          src={src}
          alt={alt}
          className="max-w-full max-h-[360px] object-contain rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 my-3 mx-auto block shadow-xs"
        />
      );
    }
    // Inline code: `...`
    else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`code-${match.index}`}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-100 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/70 text-cyan-700 dark:text-cyan-200 text-xs font-mono font-semibold"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    // Bold text: **...**
    else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`bold-${match.index}`} className="text-slate-900 dark:text-zinc-100 font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    // Link: [text](url)
    else if (token.startsWith('[') && token.includes('](')) {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 underline underline-offset-2 transition-colors font-medium"
        >
          {match[4]}
        </a>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function ProblemStatement({ description }: { description?: string | null }) {
  if (!description) {
    return <p className="text-slate-500 italic">Loading problem specification...</p>;
  }

  // Detect HTML descriptions
  const isHtml = /<p>|<div|<ul|<h[1-6]|<table/i.test(description);
  if (isHtml) {
    const clean = sanitizeHtml(description);
    return (
      <div
        className="overflow-y-auto prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words font-sans
          [&>p]:mb-3.5 [&>p]:leading-relaxed [&>p]:text-slate-700 dark:[&>p]:text-zinc-200
          [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:mx-0.5 [&_code]:rounded-md [&_code]:bg-slate-100 dark:[&_code]:bg-zinc-800/90 [&_code]:border [&_code]:border-slate-200 dark:[&_code]:border-zinc-700/70 [&_code]:text-cyan-700 dark:[&_code]:text-cyan-200 [&_code]:text-xs [&_code]:font-mono [&_code]:font-semibold
          [&_img]:max-w-full [&_img]:max-h-[380px] [&_img]:object-contain [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-zinc-800 [&_img]:bg-white dark:[&_img]:bg-zinc-950/70 [&_img]:p-2.5 [&_img]:mx-auto [&_img]:my-4
          [&_ul]:my-3 [&_ul]:space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5
          [&_ol]:my-3 [&_ol]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5
          [&_li]:text-sm [&_li]:text-slate-700 dark:[&_li]:text-zinc-200 [&_li]:leading-relaxed
          [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base [&_h1]:text-slate-900 dark:[&_h1]:text-zinc-100 [&_h2]:text-slate-900 dark:[&_h2]:text-zinc-100 [&_h3]:text-slate-900 dark:[&_h3]:text-zinc-100
          [&_strong]:text-slate-900 dark:[&_strong]:text-zinc-100 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  // Parse Markdown lines & structures
  const lines = description.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      elements.push(
        <pre
          key={`code-block-${elements.length}`}
          className="p-3.5 my-3 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs overflow-x-auto font-mono text-slate-800 dark:text-slate-200"
        >
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      );
      codeBlockLines = [];
      inCodeBlock = false;
    }
  };

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-3 space-y-1.5 list-disc pl-5">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Code block toggle ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    // Standalone Markdown Image: ![alt](url)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushList();
      const [, alt, src] = imgMatch;
      elements.push(
        <img
          key={`img-${lineIdx}`}
          src={src.split(/\s+/)[0]}
          alt={alt || 'Problem illustration'}
          className="max-w-full max-h-[380px] object-contain rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5 my-3 mx-auto block shadow-xs"
        />
      );
      return;
    }

    // HTML image tag: <img src="..." alt="..." />
    const htmlImgMatch = trimmed.match(/^<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (htmlImgMatch) {
      flushList();
      const src = htmlImgMatch[1];
      const altMatch = trimmed.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : 'Problem illustration';
      elements.push(
        <img
          key={`htmlimg-${lineIdx}`}
          src={src}
          alt={alt}
          className="max-w-full max-h-[380px] object-contain rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5 my-3 mx-auto block shadow-xs"
        />
      );
      return;
    }

    // Bullet item: - item or * item
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      inList = true;
      listItems.push(
        <li key={`li-${lineIdx}`} className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed font-sans">
          {renderInlineTokens(bulletMatch[1])}
        </li>
      );
      return;
    }

    flushList();

    if (!trimmed) {
      elements.push(<div key={`sp-${lineIdx}`} className="h-2" />);
      return;
    }

    // Headings: #, ##, ###
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#+\s*/, '');
      const isConstraints = /constraints/i.test(headingText);
      elements.push(
        <h4
          key={`h-${lineIdx}`}
          className={`font-semibold tracking-wide my-3 font-mono flex items-center gap-2 ${
            isConstraints
              ? 'text-cyan-600 dark:text-cyan-400 text-sm uppercase tracking-wider font-bold'
              : 'text-slate-900 dark:text-zinc-100 text-base font-bold'
          }`}
        >
          {isConstraints && <span className="text-cyan-600 dark:text-cyan-400">⚡</span>}
          {renderInlineTokens(headingText)}
        </h4>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${lineIdx}`} className="my-2 leading-relaxed text-slate-700 dark:text-zinc-200 font-sans text-sm">
        {renderInlineTokens(line)}
      </p>
    );
  });

  flushCodeBlock();
  flushList();

  return (
    <div className="overflow-y-auto prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words font-sans">
      <div className="space-y-1">{elements}</div>
    </div>
  );
}
