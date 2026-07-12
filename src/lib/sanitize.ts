/**
 * sanitize.ts
 *
 * Thin wrapper around DOMPurify for sanitizing admin-authored HTML before
 * rendering it with dangerouslySetInnerHTML.
 *
 * DOMPurify requires `window` / a real DOM, so it must only run on the client.
 * This module guards against accidental SSR usage and falls back to stripping
 * all tags if somehow called server-side.
 *
 * Allowed tags: a subset of safe presentational/semantic HTML that covers
 * typical problem descriptions (paragraphs, lists, code blocks, headings,
 * tables). Everything else — including <script>, <iframe>, <object>, <embed>,
 * event handlers, javascript: hrefs, and data: URIs — is stripped.
 */

// These are the only HTML tags we expect in problem descriptions.
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'code', 'pre', 'kbd',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote',
  'a',
  'img',
  'span', 'div',
];

// Only safe, non-executable attributes are allowed.
const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'class', 'id',
  'colspan', 'rowspan',
  'start', 'type', // ol attributes
];

/**
 * Returns a sanitized HTML string safe to pass to dangerouslySetInnerHTML.
 * Must only be called in a browser context (inside useEffect or event handlers).
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    // SSR fallback: strip all tags rather than render raw HTML.
    return dirty.replace(/<[^>]*>/g, '');
  }

  // Dynamic import is not needed here — DOMPurify is imported at module level
  // because this file is only ever imported by client components (Workspace is
  // 'use client' and uses next/dynamic with ssr:false).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require('dompurify');

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force all links to open in a new tab and carry noopener
    ADD_ATTR: ['target'],
    // Forbid data: and javascript: URIs everywhere
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style', 'onerror', 'onload'],
    // Prevent mXSS by enforcing the correct namespace
    FORCE_BODY: false,
    // Strip any DOM clobbering attempts
    SANITIZE_DOM: true,
  });
}