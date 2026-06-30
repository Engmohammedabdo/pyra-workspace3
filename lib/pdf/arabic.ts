// Arabic rendering for jsPDF — uses jsPDF's BUILT-IN doc.processArabic(), the
// exact same primitive the production quote-pdf / invoice-pdf / payslip-pdf
// generators use (and which renders Arabic correctly). An earlier version of
// this file rolled its own arabic-reshaper + bidi-js pipeline, which produced
// garbled/disconnected glyphs — replaced wholesale.
//
// processArabic() does contextual letter shaping + visual reordering, returning
// a string that jsPDF's text() (which lays out left-to-right) draws as correct
// RTL Arabic. The caller MUST have the Amiri font set on `doc` first.
//
// Pure-JS only — no node:fs, no DOM. Works in Node (server PDF gen) and browser.

import type jsPDF from 'jspdf';

/**
 * Shape + visually reorder a single line via jsPDF's built-in processArabic,
 * ready to hand straight to doc.text(). Matches the proven quote/invoice path.
 * NOTE: pass the SAME `doc` you will draw with (processArabic is an instance
 * method). The caller must have set the Amiri font before drawing the result.
 */
export function prepareRtl(doc: jsPDF, text: string): string {
  if (!text) return '';
  return doc.processArabic(text);
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
 * Splits the RAW (logical-order) text into visual lines FIRST, then runs
 * processArabic on each line individually. Doing it in this order is essential:
 * processArabic reverses character order for LTR rendering, so splitting AFTER
 * processing would scramble word order across line breaks. splitTextToSize
 * honours embedded "\n" hard breaks too.
 *
 * Returns the new y after the paragraph.
 * NOTE: the caller MUST have set the Amiri font on `doc` before calling
 * (e.g. doc.setFont('Amiri', 'normal')) — this helper does not set it.
 */
export function drawRtlParagraph(doc: jsPDF, text: string, opts: ParaOpts): number {
  const { x, maxWidth, lineHeight } = opts;
  let y = opts.y;
  if (!text) return y; // empty paragraph → draw nothing, eat no vertical space
  const bottom = opts.bottomMargin ?? 280;
  const top = opts.pageTopY ?? 20;
  if (opts.fontSize) doc.setFontSize(opts.fontSize);
  // Wrap on the RAW text (Amiri metrics), then shape+reorder each line.
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > bottom) { doc.addPage(); y = top; }
    doc.text(doc.processArabic(line), x, y, { align: 'right' });
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
