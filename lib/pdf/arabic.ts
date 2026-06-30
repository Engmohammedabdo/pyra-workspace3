// Improved Arabic rendering for jsPDF: contextual shaping (arabic-reshaper)
// + visual reordering (bidi-js), then hand the result to jsPDF text() which
// draws left-to-right. Fixes broken/disconnected Arabic in dense paragraphs
// that jsPDF's built-in processArabic handles poorly.
//
// Pure-JS only — no node:fs, no DOM. Works in Node (server PDF gen) and browser.
//
// arabic-reshaper API: reshaper.convertArabic(text) → shaped string
// bidi-js API: bidiFactory() → bidi; bidi.getEmbeddingLevels(text, dir); bidi.getReorderSegments(text, embedding)

// eslint-disable-next-line @typescript-eslint/no-require-imports
const reshaper = require('arabic-reshaper') as { convertArabic: (text: string) => string };
import bidiFactory from 'bidi-js';
import type jsPDF from 'jspdf';

const bidi = bidiFactory();

/** Shape + bidi-reorder a single line for jsPDF (which renders LTR). */
export function prepareRtl(text: string): string {
  if (!text) return '';
  const shaped = reshaper.convertArabic(text);
  const embedding = bidi.getEmbeddingLevels(shaped, 'rtl');
  const flips = bidi.getReorderSegments(shaped, embedding);
  // Apply the reorder segments (reverse each) to produce visual order.
  const chars = shaped.split('');
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = start; i <= end; i++) chars[i] = slice[i - start];
  }
  return chars.join('');
}

interface ParaOpts {
  x: number;          // right edge for RTL (align right)
  y: number;
  maxWidth: number;
  lineHeight: number;
  fontSize?: number;
  bottomMargin?: number;  // page-break threshold (default 280)
  pageTopY?: number;      // y to reset to after a page break (default 20)
}

/**
 * Draw a wrapped RTL Arabic paragraph, right-aligned at opts.x.
 * Wraps on the SHAPED text width, prepares each line, auto page-breaks.
 * Returns the new y after the paragraph.
 */
export function drawRtlParagraph(doc: jsPDF, text: string, opts: ParaOpts): number {
  const { x, maxWidth, lineHeight } = opts;
  let y = opts.y;
  const bottom = opts.bottomMargin ?? 280;
  const top = opts.pageTopY ?? 20;
  if (opts.fontSize) doc.setFontSize(opts.fontSize);
  const shaped = reshaper.convertArabic(text || '');
  const lines: string[] = doc.splitTextToSize(shaped, maxWidth);
  for (const line of lines) {
    if (y > bottom) { doc.addPage(); y = top; }
    doc.text(prepareRtlShaped(line), x, y, { align: 'right' });
    y += lineHeight;
  }
  return y;
}

/** prepareRtl when text is ALREADY shaped (used internally after splitTextToSize). */
function prepareRtlShaped(shaped: string): string {
  const embedding = bidi.getEmbeddingLevels(shaped, 'rtl');
  const flips = bidi.getReorderSegments(shaped, embedding);
  const chars = shaped.split('');
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = start; i <= end; i++) chars[i] = slice[i - start];
  }
  return chars.join('');
}

/** EN line (left) + AR line (right) clause block. Returns new y. */
export function drawBilingualClause(
  doc: jsPDF, en: string, ar: string,
  opts: { xLeft: number; xRight: number; y: number; maxWidth: number; lineHeight: number },
): number {
  let y = opts.y;
  doc.setFont('helvetica', 'normal');
  const enLines: string[] = doc.splitTextToSize(en, opts.maxWidth);
  for (const l of enLines) { doc.text(l, opts.xLeft, y); y += opts.lineHeight; }
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, ar, { x: opts.xRight, y, maxWidth: opts.maxWidth, lineHeight: opts.lineHeight });
  return y;
}
