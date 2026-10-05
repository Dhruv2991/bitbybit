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
  // Direct SVG elements
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'clipPath', 'use', 'marker',
  'linearGradient', 'radialGradient', 'stop', 'image'
];

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height', 'loading',
  'class', 'id', 'style',
  'colspan', 'rowspan',
  'start', 'type',
  // SVG attributes
  'viewBox', 'xmlns', 'xmlns:xlink', 'xlink:href',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
  'transform', 'opacity', 'fill-opacity', 'stroke-opacity', 'preserveAspectRatio'
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
    ADD_DATA_URI_TAGS: ['img', 'image'],
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    FORCE_BODY: false,
    SANITIZE_DOM: true,
  });
}
