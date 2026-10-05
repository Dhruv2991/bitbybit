/**
 * sanitizeHtml.ts
 *
 * Safe HTML sanitization using DOMPurify for problem descriptions.
 * Allows safe presentational tags, images (including data URIs and local upload URLs),
 * and standard formatting while stripping scripts and unsafe handlers.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'code', 'pre', 'kbd',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote',
  'a',
  'img', 'figure', 'figcaption',
  'span', 'div',
];

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height', 'loading',
  'class', 'id',
  'colspan', 'rowspan',
  'start', 'type',
];

let hookAdded = false;

function ensureHooks(DOMPurify: any) {
  if (hookAdded) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName === 'A') {
      if (node.getAttribute('target') === '_blank' || !node.hasAttribute('rel')) {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  hookAdded = true;
}

/**
 * Returns a sanitized HTML string safe to pass to dangerouslySetInnerHTML.
 * Must only be called in a browser context (inside useEffect or event handlers).
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    return dirty.replace(/<[^>]*>/g, '');
  }

  // eslint-disable-next-line
  const DOMPurify = require('dompurify');
  ensureHooks(DOMPurify);

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    ADD_DATA_URI_TAGS: ['img'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
    FORCE_BODY: false,
    SANITIZE_DOM: true,
  });
}
