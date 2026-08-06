/**
 * Width-aware truncation for the single-line, dotted-underline fields in the
 * invoice/quote header block.
 *
 * Why this exists: those fields used to be capped by a hand-picked CHARACTER
 * count (`.slice(0, 20)`, `.slice(0, 22)`, …). A character count is not a
 * width, so the cap did both wrong things at once:
 *
 *  - It cut names that fit. "Zea Restaurant Limited" is 22 chars but only
 *    ~31mm wide, inside a 40mm field — the 20-char cap printed
 *    "Zea Restaurant Limit" on a real customer invoice (2026-08-06).
 *  - It did NOT stop the overflow it looked like it was preventing. Twenty
 *    wide glyphs ("WWWWWWWWWWWWWWWWWWWW") measure ~56mm and ran straight
 *    past the same 40mm dotted line.
 *
 * Measuring instead of counting fixes both. The measurement is injected rather
 * than taken from a jsPDF instance so the logic stays pure and unit-testable
 * without a document — the caller passes `(s) => doc.getTextWidth(s)` AFTER
 * setting the font and size it will actually draw with.
 */

/** Measures the rendered width of `text` in the document's current unit. */
export type MeasureText = (text: string) => number;

const ELLIPSIS = '…';

/**
 * Returns `text` unchanged when it fits `maxWidth`, otherwise the longest
 * prefix that fits once an ellipsis is appended.
 *
 * Truncation is by measured width, so it is correct for proportional fonts.
 * If not even the ellipsis fits, returns an empty string — drawing a bare "…"
 * wider than its own field would reintroduce the overflow this prevents.
 */
export function fitText(measure: MeasureText, text: string, maxWidth: number): string {
  if (!text) return '';
  if (maxWidth <= 0) return '';
  if (measure(text) <= maxWidth) return text;

  if (measure(ELLIPSIS) > maxWidth) return '';

  // Longest prefix p such that width(p + '…') <= maxWidth. Binary search over
  // prefix length: width is monotonic in prefix length for left-to-right text.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + ELLIPSIS) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ELLIPSIS;
}
