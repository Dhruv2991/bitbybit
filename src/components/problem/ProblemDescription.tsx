'use client';
// ════════════════════════════════════════════════════════════
// src/components/problem/ProblemDescription.tsx
//
// LeetCode-Grade Problem Description View
// - Monospace inline code pills for variables/types (`nums`, `k`, `TreeNode`)
// - Dedicated bordered callout boxes for Examples with headers (Input, Output, Explanation)
// - Clean bulleted constraints with monospace notation
// - Responsive, rounded, centered markdown images
// - Full HTML & Markdown support with strict sanitization
// ════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import type { Problem } from '@/types/database';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface ProblemDescriptionProps {
  problem: Problem;
  className?: string;
}

interface ParsedExample {
  title: string;
  input: string;
  output: string;
  explanation?: string;
}

/**
 * Extracts and parses structured examples from problem.example or description text
 */
function parseExampleText(exampleText: string): ParsedExample[] {
  if (!exampleText || !exampleText.trim()) return [];

  const rawBlocks = exampleText.split(/(?:Example\s*\d*:?|###\s*Example\s*\d*:?)/gi).filter(Boolean);
  
  if (rawBlocks.length > 0 && exampleText.toLowerCase().includes('example')) {
    const examples: ParsedExample[] = [];
    rawBlocks.forEach((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      const inputMatch = trimmed.match(/Input:\s*([\s\S]*?)(?=(?:Output:|Explanation:|$))/i);
      const outputMatch = trimmed.match(/Output:\s*([\s\S]*?)(?=(?:Explanation:|$))/i);
      const explMatch = trimmed.match(/Explanation:\s*([\s\S]*?)$/i);

      if (inputMatch || outputMatch) {
        examples.push({
          title: `Example ${idx + 1}`,
          input: inputMatch ? inputMatch[1].trim() : '',
          output: outputMatch ? outputMatch[1].trim() : '',
          explanation: explMatch ? explMatch[1].trim() : undefined,
        });
      }
    });
    if (examples.length > 0) return examples;
  }

  // Fallback single example parser
  const inputMatch = exampleText.match(/Input:\s*([\s\S]*?)(?=(?:Output:|Explanation:|$))/i);
  const outputMatch = exampleText.match(/Output:\s*([\s\S]*?)(?=(?:Explanation:|$))/i);
  const explMatch = exampleText.match(/Explanation:\s*([\s\S]*?)$/i);

  if (inputMatch || outputMatch) {
    return [{
      title: 'Example 1',
      input: inputMatch ? inputMatch[1].trim() : '',
      output: outputMatch ? outputMatch[1].trim() : '',
      explanation: explMatch ? explMatch[1].trim() : undefined,
    }];
  }

  // Unstructured raw text
  return [{
    title: 'Example',
    input: exampleText.trim(),
    output: '',
  }];
}

/**
 * Resilient image renderer that automatically resolves Supabase storage URLs
 * and falls back to the /api/images proxy if direct CDN access fails.
 */
function ProblemImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [imgSrc, setImgSrc] = React.useState(() => {
    const clean = (src || '').trim().replace(/^['"]|['"]$/g, '');
    if (clean.includes('/storage/v1/object/public/problem-images/')) {
      const fileName = clean.split('/problem-images/')[1]?.split('?')[0];
      if (fileName) return `/api/images/${fileName}`;
    }
    return clean;
  });
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    const clean = (src || '').trim().replace(/^['"]|['"]$/g, '');
    if (clean.includes('/storage/v1/object/public/problem-images/')) {
      const fileName = clean.split('/problem-images/')[1]?.split('?')[0];
      if (fileName) {
        setImgSrc(`/api/images/${fileName}`);
        setLoadError(false);
        return;
      }
    }
    setImgSrc(clean);
    setLoadError(false);
  }, [src]);

  const handleError = () => {
    if (!imgSrc.startsWith('/api/images/')) {
      const parts = imgSrc.split('/');
      const fileName = parts[parts.length - 1]?.split('?')[0];
      if (fileName) {
        setImgSrc(`/api/images/${fileName}`);
        return;
      }
    }
    setLoadError(true);
  };

  if (loadError) {
    return (
      <div className="my-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 text-center font-mono text-xs text-zinc-400">
        <span className="text-zinc-500">🖼️ Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}

/**
 * Renders an image element with graceful fallback and responsive styling
 */
function renderImageBlock(src: string, alt = '', key: string | number) {
  const cleanAlt = (alt || 'Problem illustration').trim();

  return (
    <div key={key} className="my-4 text-center">
      <ProblemImage
        src={src}
        alt={cleanAlt}
        className="max-w-full w-full max-h-[380px] object-contain rounded-xl border border-zinc-800 bg-zinc-950/40 p-2.5 mx-auto shadow-md transition-transform hover:scale-[1.01]"
      />
      {cleanAlt && cleanAlt !== 'Problem illustration' && (
        <p className="text-xs text-zinc-400 font-mono mt-1.5 italic">{cleanAlt}</p>
      )}
    </div>
  );
}

/**
 * Parses markdown into stylized React nodes with inline code pills, links, images, bold text, and constraints
 */
function renderMarkdownRich(content: string): React.ReactNode {
  if (!content) return null;

  // Split into lines for block-level parsing
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  function flushList() {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-3 space-y-2 list-none pl-1">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  }

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Check if standalone markdown image: ![alt](url)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushList();
      const [, alt, src] = imgMatch;
      // Strip optional title part e.g. "url title"
      const urlPart = src.split(/\s+/)[0];
      elements.push(renderImageBlock(urlPart, alt, `img-${lineIdx}`));
      return;
    }

    // Check if HTML image tag: <img src="..." alt="..." />
    const htmlImgMatch = trimmed.match(/^<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (htmlImgMatch) {
      flushList();
      const src = htmlImgMatch[1];
      const altMatch = trimmed.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';
      elements.push(renderImageBlock(src, alt, `htmlimg-${lineIdx}`));
      return;
    }

    // Check if bullet point (e.g. - `nums.length <= 10^5` or * constraint)
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      inList = true;
      listItems.push(
        <li key={`li-${lineIdx}`} className="flex items-start gap-2.5 text-sm md:text-[14.5px] text-zinc-200 font-mono leading-relaxed">
          <span className="text-cyan-400 font-bold select-none text-[15px] leading-none mt-1">•</span>
          <span className="flex-1">{renderInlineStyled(bulletMatch[1])}</span>
        </li>
      );
      return;
    }

    // Regular line - flush list if we were in one
    flushList();

    if (!trimmed) {
      elements.push(<div key={`sp-${lineIdx}`} className="h-2" />);
      return;
    }

    // Heading ### Constraints
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#+\s*/, '');
      const isConstraints = /constraints/i.test(headingText);
      elements.push(
        <h4
          key={`h-${lineIdx}`}
          className={`font-semibold tracking-wide my-4 font-mono flex items-center gap-2 ${
            isConstraints ? 'text-cyan-400 text-sm md:text-base uppercase tracking-wider font-bold' : 'text-zinc-100 text-base md:text-lg font-bold'
          }`}
        >
          {isConstraints && <span className="text-cyan-400">⚡</span>}
          {headingText}
        </h4>
      );
      return;
    }

    // Normal paragraph
    elements.push(
      <p key={`p-${lineIdx}`} className="text-sm md:text-[15px] text-zinc-200 leading-relaxed my-2 font-sans">
        {renderInlineStyled(line)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1.5">{elements}</div>;
}

/**
 * Renders inline code `x`, images ![alt](url), bold **text**, and links
 */
function renderInlineStyled(text: string): React.ReactNode {
  // Regex to match markdown images, code `...`, bold **...**, links [...](...), or HTML <img> tags
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
      const altText = match[2] || '';
      const srcUrl = (match[3] || '').split(/\s+/)[0];
      parts.push(renderImageBlock(srcUrl, altText, `inline-img-${match.index}`));
    }
    // HTML Image tag: <img src="..." />
    else if (token.toLowerCase().startsWith('<img')) {
      const src = match[6] || '';
      const altMatch = token.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';
      parts.push(renderImageBlock(src, alt, `inline-html-img-${match.index}`));
    }
    // Inline code: `...`
    else if (token.startsWith('`') && token.endsWith('`')) {
      const codeVal = token.slice(1, -1);
      parts.push(
        <code
          key={match.index}
          className="px-2 py-0.5 mx-0.5 rounded-md bg-zinc-800/90 border border-zinc-700/70 text-cyan-200 text-[13px] font-mono tracking-tight shadow-2xs font-semibold inline-block"
        >
          {codeVal}
        </code>
      );
    }
    // Bold text: **...**
    else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="text-zinc-100 font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    // Link: [text](url)
    else if (token.startsWith('[') && token.includes('](')) {
      const linkText = match[4];
      const linkUrl = match[5];
      parts.push(
        <a
          key={match.index}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
        >
          {linkText}
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

export default function ProblemDescription({ problem, className = '' }: ProblemDescriptionProps) {
  // Check whether description is mostly HTML vs Markdown
  const isHtml = useMemo(() => {
    const desc = problem.description || '';
    return /<p>|<div|<ul|<h[1-6]|<table/i.test(desc);
  }, [problem.description]);

  const sanitizedHtml = useMemo(() => {
    if (!isHtml) return '';
    let raw = problem.description || '<p>No description provided.</p>';
    // If description has markdown images ![alt](url) alongside HTML, convert them to <img> tags
    raw = raw.replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, src) => {
      const urlPart = (src || '').split(/\s+/)[0];
      return `<img src="${urlPart}" alt="${alt || ''}" class="max-w-full w-full max-h-[380px] object-contain rounded-xl border border-zinc-800 bg-zinc-950/40 p-2.5 my-4 shadow-md mx-auto block" />`;
    });
    // Route any Supabase storage problem-images URLs through universal /api/images/ proxy
    raw = raw.replace(/https?:\/\/[^"'\s]+\/storage\/v1\/object\/public\/problem-images\/([^"'\s>]+)/gi, '/api/images/$1');
    return sanitizeHtml(raw);
  }, [isHtml, problem.description]);

  const parsedExamples = useMemo(() => {
    return parseExampleText(problem.example || '');
  }, [problem.example]);

  return (
    <div className={`space-y-5 text-zinc-200 font-sans text-sm md:text-base leading-relaxed ${className}`}>
      {/* ── Problem Title & Metadata Bar ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap border-b border-zinc-800/60 pb-4">
        <div className="space-y-2 flex-1 min-w-[200px]">
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight font-display flex items-center gap-2.5">
            <span>{problem.title}</span>
          </h2>
          {(problem.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {problem.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-md text-xs font-mono hover:border-zinc-700 transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={
              problem.difficulty === 'Easy'
                ? 'diff-easy'
                : problem.difficulty === 'Medium'
                ? 'diff-medium'
                : 'diff-hard'
            }
          >
            {problem.difficulty}
          </span>
          <span className="px-3 py-1 bg-purple-500/10 text-purple-300 rounded-full text-xs font-mono font-semibold border border-purple-500/20">
            {problem.points} pts
          </span>
        </div>
      </div>

      {/* ── Main Problem Statement Body ── */}
      <div className="problem-content">
        {isHtml ? (
          <div
            className="prose prose-invert prose-base max-w-none text-zinc-200 leading-relaxed
              [&>p]:mb-3.5 [&>p]:leading-relaxed [&>p]:text-zinc-200 [&>p]:text-[15px]
              [&_code]:px-2 [&_code]:py-0.5 [&_code]:mx-0.5 [&_code]:rounded-md [&_code]:bg-zinc-800/90 [&_code]:border [&_code]:border-zinc-700/70 [&_code]:text-cyan-200 [&_code]:text-[13px] [&_code]:font-mono [&_code]:font-semibold
              [&_img]:max-w-full [&_img]:w-full [&_img]:max-h-[380px] [&_img]:object-contain [&_img]:rounded-xl [&_img]:border [&_img]:border-zinc-800 [&_img]:bg-zinc-950/40 [&_img]:p-2.5 [&_img]:mx-auto [&_img]:my-4 [&_img]:shadow-md
              [&_svg]:max-w-full [&_svg]:max-h-[380px] [&_svg]:mx-auto [&_svg]:my-4 [&_svg]:rounded-xl [&_svg]:border [&_svg]:border-zinc-800 [&_svg]:bg-zinc-950/40 [&_svg]:p-2.5
              [&_ul]:my-3 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5
              [&_li]:text-sm md:[&_li]:text-[14.5px] [&_li]:font-mono [&_li]:text-zinc-200 [&_li]:leading-relaxed
              [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h4]:text-base
              [&_strong]:text-zinc-100 [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          renderMarkdownRich(problem.description || 'No description provided.')
        )}
      </div>

      {/* ── Examples Callout Boxes (LeetCode Style) ── */}
      {parsedExamples.length > 0 && (
        <div className="space-y-4 mt-6">
          {parsedExamples.map((ex, idx) => (
            <div
              key={idx}
              className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl overflow-hidden shadow-xs hover:border-zinc-700/80 transition-all duration-200"
            >
              {/* Example Header */}
              <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  {ex.title}
                </span>
              </div>

              {/* Example Body */}
              <div className="p-4 space-y-2.5 font-mono text-sm">
                {ex.input && (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                    <span className="text-zinc-400 font-sans font-semibold text-xs w-20 shrink-0 select-none">
                      Input:
                    </span>
                    <code className="text-zinc-100 bg-zinc-950/80 px-2.5 py-1 rounded-md border border-zinc-800/80 flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed">
                      {ex.input}
                    </code>
                  </div>
                )}

                {ex.output && (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                    <span className="text-zinc-400 font-sans font-semibold text-xs w-20 shrink-0 select-none">
                      Output:
                    </span>
                    <code className="text-emerald-300 bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-900/50 font-semibold flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed">
                      {ex.output}
                    </code>
                  </div>
                )}

                {ex.explanation && (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 pt-2 border-t border-zinc-800/60">
                    <span className="text-zinc-400 font-sans font-semibold text-xs w-20 shrink-0 select-none">
                      Explanation:
                    </span>
                    <span className="text-zinc-200 font-sans text-sm md:text-[14.5px] leading-relaxed flex-1">
                      {renderInlineStyled(ex.explanation)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
