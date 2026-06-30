// Arabic rendering for jsPDF with CORRECT bidirectional (bidi) handling for
// mixed Arabic + Latin/number lines.
//
// WHY NOT jsPDF's built-in pipeline alone? jsPDF auto-runs processArabic
// (shaping) + its own bidiEngine on every text(). That engine orders Arabic +
// numbers fine, but MIS-ORDERS embedded strong-LTR runs (English words like
// "PyramediaX" in the middle of an Arabic sentence) — it flips the line.
// Verified empirically against jsPDF 3.0.4.
//
// SOLUTION: we do shaping (arabic-reshaper) + proper Unicode bidi reordering
// (bidi-js getReorderedString) OURSELVES — bidi-js keeps Latin/number runs in
// forward order and places every run correctly — then hand jsPDF the finished
// VISUAL string and tell it (via enableRtlPassthrough) to leave it untouched
// (isInputVisual + isOutputVisual = true → its bidiEngine is a no-op, and
// processArabic is a no-op on the already-shaped presentation forms).
//
// Pure-JS only — no node:fs, no DOM. Works in Node (server PDF gen) and browser.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const reshaper = require('arabic-reshaper') as { convertArabic: (t: string) => string };
import bidiFactory from 'bidi-js';
import type jsPDF from 'jspdf';

const bidi = bidiFactory();

/**
 * Patch a jsPDF instance so text() draws our PRE-REORDERED RTL strings verbatim.
 * Injects { isInputVisual: true, isOutputVisual: true } into every text() call,
 * which makes jsPDF's built-in bidiEngine a no-op (we already did the bidi via
 * bidi-js). Pure-LTR English/number strings are unaffected by these flags, so
 * non-Arabic text() calls keep rendering correctly.
 *
 * Call ONCE per document, AFTER registerArabicFont and BEFORE any drawing.
 */
export function enableRtlPassthrough(doc: jsPDF): void {
  const orig = doc.text.bind(doc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).text = (text: any, x: number, y: number, options?: any, transform?: any) =>
    orig(text, x, y, { ...(options || {}), isInputVisual: true, isOutputVisual: true }, transform);
}

/**
 * Shape + bidi-reorder a single line into VISUAL order, ready for jsPDF text()
 * on a doc that has had enableRtlPassthrough() applied. Latin/number runs stay
 * forward; Arabic runs are shaped + reversed; brackets are mirrored.
 * (The `_doc` param is kept for call-site compatibility; bidi-js needs no doc.)
 */
export function prepareRtl(_doc: jsPDF, text: string): string {
  if (!text) return '';
  const shaped = reshaper.convertArabic(text);
  const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
  return bidi.getReorderedString(shaped, levels);
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
 *
 * Wraps on the RAW (logical-order) text first — splitTextToSize returns logical
 * substrings and honours embedded "\n" — then bidi-reorders each line via
 * prepareRtl. Wrapping before reordering is essential: reordering first would
 * scramble word order across line breaks.
 *
 * Returns the new y after the paragraph.
 * NOTE: caller MUST have set the Amiri font AND called enableRtlPassthrough(doc).
 */
export function drawRtlParagraph(doc: jsPDF, text: string, opts: ParaOpts): number {
  const { x, maxWidth, lineHeight } = opts;
  let y = opts.y;
  if (!text) return y; // empty paragraph → draw nothing, eat no vertical space
  const bottom = opts.bottomMargin ?? 280;
  const top = opts.pageTopY ?? 20;
  if (opts.fontSize) doc.setFontSize(opts.fontSize);
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > bottom) { doc.addPage(); y = top; }
    doc.text(prepareRtl(doc, line), x, y, { align: 'right' });
    y += lineHeight;
  }
  return y;
}

/** EN line (left) + AR line (right) clause block. Returns new y. */
export function drawBilingualClause(
  doc: jsPDF, en: string, ar: string,
  opts: { xLeft: number; xRight: number; y: number; maxWidth: number; lineHeight: number },
): number {
  let y = opts.y;
  // Save the caller's active font so we restore it on exit — otherwise the doc
  // is left on 'Amiri' and subsequent LTR content renders in the wrong font.
  const prevFont = (doc as unknown as {
    internal: { getFont: () => { fontName: string; fontStyle: string } };
  }).internal.getFont();
  doc.setFont('helvetica', 'normal');
  const enLines: string[] = doc.splitTextToSize(en, opts.maxWidth);
  for (const l of enLines) { doc.text(l, opts.xLeft, y); y += opts.lineHeight; }
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, ar, { x: opts.xRight, y, maxWidth: opts.maxWidth, lineHeight: opts.lineHeight });
  doc.setFont(prevFont.fontName, prevFont.fontStyle);
  return y;
}
