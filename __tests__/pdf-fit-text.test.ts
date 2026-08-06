import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { fitText } from '@/lib/pdf/fit-text';

// A deterministic stand-in for jsPDF's measurement: every glyph is 1 unit wide.
// Lets the truncation logic be asserted exactly, without font metrics.
const uniform = (s: string) => s.length;

describe('fitText (width-aware truncation)', () => {
  it('returns empty string for empty input', () => {
    expect(fitText(uniform, '', 100)).toBe('');
  });

  it('returns the text unchanged when it fits', () => {
    expect(fitText(uniform, 'Zea', 10)).toBe('Zea');
  });

  it('returns the text unchanged when it exactly fills the width', () => {
    expect(fitText(uniform, 'abcde', 5)).toBe('abcde');
  });

  it('truncates with an ellipsis when too wide', () => {
    // width 5 → 4 chars + '…' (the ellipsis is one unit under `uniform`)
    expect(fitText(uniform, 'abcdefghij', 5)).toBe('abcd…');
  });

  it('never returns something wider than the budget', () => {
    for (let w = 1; w <= 12; w++) {
      expect(uniform(fitText(uniform, 'abcdefghij', w))).toBeLessThanOrEqual(w);
    }
  });

  it('returns empty string when not even the ellipsis fits', () => {
    expect(fitText(uniform, 'abcdef', 0.5)).toBe('');
  });

  it('returns empty string for a non-positive width', () => {
    expect(fitText(uniform, 'abc', 0)).toBe('');
    expect(fitText(uniform, 'abc', -5)).toBe('');
  });
});

// The regression this helper was written for: the invoice/quote header block
// capped these fields by character count, which cut names that fit and let
// wide ones overflow anyway. Geometry below mirrors lib/pdf/invoice-pdf.ts.
describe('fitText against the real invoice header geometry', () => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const measure = (s: string) => doc.getTextWidth(s);

  const M = 14;
  const infoX = M + 68;
  const midCol = M + 128;
  const CONTACT_WIDTH = midCol - 3 - (infoX + 17); // 40mm

  it('keeps "Zea Restaurant Limited" intact — the old 20-char cap cut it', () => {
    const name = 'Zea Restaurant Limited';
    expect(name.length).toBeGreaterThan(20); // the old cap would have truncated
    expect(measure(name)).toBeLessThan(CONTACT_WIDTH); // but it fits by width
    expect(fitText(measure, name, CONTACT_WIDTH)).toBe(name);
  });

  it('truncates wide text the old 20-char cap let overflow', () => {
    const wide = 'W'.repeat(20);
    expect(measure(wide)).toBeGreaterThan(CONTACT_WIDTH); // old cap overflowed
    const out = fitText(measure, wide, CONTACT_WIDTH);
    expect(measure(out)).toBeLessThanOrEqual(CONTACT_WIDTH);
    expect(out.endsWith('…')).toBe(true);
  });
});
