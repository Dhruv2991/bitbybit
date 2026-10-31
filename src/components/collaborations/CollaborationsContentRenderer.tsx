'use client';
// ════════════════════════════════════════════════════════════
// src/components/collaborations/CollaborationsContentRenderer.tsx
// Safe HTML & Markdown renderer for Collaborations & Partnerships
// ════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface Props {
  content: string;
  className?: string;
}

/**
 * Resilient image renderer that automatically handles Supabase storage URLs
 * and routes through the image proxy endpoint when necessary.
 */
function CollabImage({ src, alt }: { src: string; alt: string }) {
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
      <div className="my-4 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 text-center font-mono text-xs text-slate-500 dark:text-zinc-500">
        <span>🖼️ [Image unavailable: {alt || 'Collaboration banner'}]</span>
      </div>
    );
  }

  return (
    <div className="my-6 text-center group">
      <img
        src={imgSrc}
        alt={alt || 'Partnership Banner'}
        loading="lazy"
        onError={handleError}
        className="max-w-full w-full max-h-[440px] object-contain rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2 sm:p-3 mx-auto shadow-xs transition-all duration-300 group-hover:border-slate-300 dark:group-hover:border-zinc-700"
      />
      {alt && alt !== 'Partnership Banner' && (
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-2 italic">{alt}</p>
      )}
    </div>
  );
}

/**
 * Parses markdown into stylized React nodes
 */
function renderMarkdown(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  function flushList() {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-4 space-y-2.5 list-none pl-1">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  }

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Markdown image: ![alt](url)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushList();
      const [, alt, src] = imgMatch;
      const urlPart = src.split(/\s+/)[0];
      elements.push(<CollabImage key={`img-${lineIdx}`} src={urlPart} alt={alt} />);
      return;
    }

    // HTML image tag: <img src="..." alt="..." />
    const htmlImgMatch = trimmed.match(/^<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (htmlImgMatch) {
      flushList();
      const src = htmlImgMatch[1];
      const altMatch = trimmed.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';
      elements.push(<CollabImage key={`htmlimg-${lineIdx}`} src={src} alt={alt} />);
      return;
    }

    // Bullet point
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      inList = true;
      listItems.push(
        <li key={`li-${lineIdx}`} className="flex items-start gap-3 text-sm md:text-[15px] text-slate-700 dark:text-zinc-300 leading-relaxed font-sans">
          <span className="text-cyan-500 font-bold select-none text-base leading-none mt-1">✦</span>
          <span className="flex-1">{renderInline(bulletMatch[1])}</span>
        </li>
      );
      return;
    }

    flushList();

    if (!trimmed) {
      elements.push(<div key={`sp-${lineIdx}`} className="h-3" />);
      return;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${lineIdx}`} className="text-2xl md:text-3xl font-bold font-display text-slate-900 dark:text-zinc-100 mt-6 mb-3 tracking-tight">
          {trimmed.replace(/^#\s*/, '')}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${lineIdx}`} className="text-xl md:text-2xl font-bold font-display text-slate-900 dark:text-zinc-100 mt-6 mb-3 tracking-tight border-b border-slate-100 dark:border-zinc-800/80 pb-2">
          {trimmed.replace(/^##\s*/, '')}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${lineIdx}`} className="text-lg md:text-xl font-semibold font-display text-cyan-600 dark:text-cyan-300 mt-5 mb-2">
          {trimmed.replace(/^###\s*/, '')}
        </h3>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${lineIdx}`} className="text-sm md:text-[15px] text-slate-700 dark:text-zinc-300 leading-relaxed my-2 font-sans">
        {renderInline(line)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-2">{elements}</div>;
}

/**
 * Handles inline code, bold, links, and inline images
 */
function renderInline(text: string): React.ReactNode {
  const tokenRegex = /(!\[([^\]]*)\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\)|<img\s+[^>]*src=["']([^"']+)["'][^>]*>)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith('![') && token.includes('](')) {
      const altText = match[2] || '';
      const srcUrl = (match[3] || '').split(/\s+/)[0];
      parts.push(<CollabImage key={`inline-img-${match.index}`} src={srcUrl} alt={altText} />);
    } else if (token.toLowerCase().startsWith('<img')) {
      const src = match[6] || '';
      const altMatch = token.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '';
      parts.push(<CollabImage key={`inline-html-img-${match.index}`} src={src} alt={alt} />);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-2 py-0.5 mx-0.5 rounded-md bg-slate-100 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/70 text-cyan-600 dark:text-cyan-200 text-xs font-mono font-semibold inline-block"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="text-slate-900 dark:text-zinc-100 font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkLabel = match[4];
      let linkHref = match[5];
      if (
        (linkLabel.includes('teamcodelocked@gmail.com') && linkHref.includes('ddhruvgnayak@gmail.com')) ||
        linkHref.includes('to=ddhruvgnayak@gmail.com')
      ) {
        linkHref = 'mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit';
      }
      parts.push(
        <a
          key={match.index}
          href={linkHref}
          target={linkHref.startsWith('mailto:') ? undefined : '_blank'}
          rel={linkHref.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
          className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors font-medium"
        >
          {linkLabel}
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

export default function CollaborationsContentRenderer({ content, className = '' }: Props) {
  const isHtml = useMemo(() => {
    if (!content) return false;
    return /<p>|<div|<ul|<ol|<h[1-6]|<table|<blockquote/i.test(content);
  }, [content]);

  const sanitizedHtml = useMemo(() => {
    if (!isHtml) return '';
    let raw = content || '<p>No content published yet.</p>';
    // If description has markdown images alongside HTML, normalize them
    raw = raw.replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, src) => {
      const urlPart = (src || '').split(/\s+/)[0];
      return `<img src="${urlPart}" alt="${alt || ''}" class="max-w-full w-full max-h-[440px] object-contain rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2 sm:p-3 my-6 shadow-xs mx-auto block" />`;
    });
    // Route any Supabase storage problem-images URLs through universal /api/images/ proxy
    raw = raw.replace(/https?:\/\/[^"'\s]+\/storage\/v1\/object\/public\/problem-images\/([^"'\s>]+)/gi, '/api/images/$1');

    // Normalize mismatched contact email links so that any link pointing to ddhruvgnayak@gmail.com
    // or mentioning teamcodelocked@gmail.com consistently targets mailto:teamcodelocked@gmail.com
    raw = raw.replace(
      /<a\s+[^>]*href=["'][^"']*ddhruvgnayak@gmail\.com[^"']*["'][^>]*>([\s\S]*?teamcodelocked@gmail\.com[\s\S]*?)<\/a>/gi,
      '<a href="mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit">$1</a>'
    );
    raw = raw.replace(
      /href=["']https?:\/\/mail\.google\.com\/mail\/\?[^"']*ddhruvgnayak@gmail\.com[^"']*["']/gi,
      'href="mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit"'
    );
    raw = raw.replace(
      /href=["']mailto:ddhruvgnayak@gmail\.com["'](?=[^>]*>[\s\S]*?teamcodelocked@gmail\.com)/gi,
      'href="mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit"'
    );

    return sanitizeHtml(raw);
  }, [isHtml, content]);

  return (
    <div className={`text-slate-800 dark:text-zinc-200 font-sans leading-relaxed ${className}`}>
      {isHtml ? (
        <div
          className="prose dark:prose-invert prose-base max-w-none text-slate-800 dark:text-zinc-200 leading-relaxed
            [&>p]:mb-4 [&>p]:leading-relaxed [&>p]:text-slate-700 dark:[&>p]:text-zinc-300 [&>p]:text-[15px]
            [&_h1]:text-2xl md:[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:font-display [&_h1]:text-slate-900 dark:[&_h1]:text-zinc-100 [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:tracking-tight
            [&_h2]:text-xl md:[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:font-display [&_h2]:text-slate-900 dark:[&_h2]:text-zinc-100 [&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-slate-100 dark:[&_h2]:border-zinc-800/80 [&_h2]:pb-2.5
            [&_h3]:text-lg md:[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:font-display [&_h3]:text-cyan-600 dark:[&_h3]:text-cyan-300 [&_h3]:mt-6 [&_h3]:mb-2.5
            [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-purple-600 dark:[&_h4]:text-purple-300 [&_h4]:mt-4 [&_h4]:mb-2
            [&_code]:px-2 [&_code]:py-0.5 [&_code]:mx-0.5 [&_code]:rounded-md [&_code]:bg-slate-100 dark:[&_code]:bg-zinc-800/90 [&_code]:border [&_code]:border-slate-200 dark:[&_code]:border-zinc-700/70 [&_code]:text-cyan-600 dark:[&_code]:text-cyan-200 [&_code]:text-xs [&_code]:font-mono [&_code]:font-semibold
            [&_img]:max-w-full [&_img]:w-full [&_img]:max-h-[440px] [&_img]:object-contain [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 dark:[&_img]:border-zinc-800 [&_img]:bg-slate-50 dark:[&_img]:bg-zinc-950/80 [&_img]:p-2 sm:[&_img]:p-3 [&_img]:mx-auto [&_img]:my-6 [&_img]:shadow-xs
            [&_ul]:my-4 [&_ul]:space-y-2.5 [&_ul]:list-disc [&_ul]:pl-5
            [&_ol]:my-4 [&_ol]:space-y-2.5 [&_ol]:list-decimal [&_ol]:pl-5
            [&_li]:text-sm md:[&_li]:text-[15px] [&_li]:text-slate-700 dark:[&_li]:text-zinc-300 [&_li]:leading-relaxed
            [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-500/60 [&_blockquote]:bg-slate-50 dark:[&_blockquote]:bg-zinc-900/50 [&_blockquote]:p-4 [&_blockquote]:rounded-r-xl [&_blockquote]:italic [&_blockquote]:text-slate-700 dark:[&_blockquote]:text-zinc-300 [&_blockquote]:my-5
            [&_a]:text-cyan-600 dark:[&_a]:text-cyan-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-cyan-500 dark:hover:[&_a]:text-cyan-300 [&_a]:transition-colors [&_a]:font-medium
            [&_strong]:text-slate-900 dark:[&_strong]:text-zinc-100 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : (
        renderMarkdown(content || 'No content published yet.')
      )}
    </div>
  );
}
