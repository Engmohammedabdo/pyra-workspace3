import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { prepareRtl, enableRtlPassthrough, drawRtlParagraph } from '@/lib/pdf/arabic';

// prepareRtl does shaping (arabic-reshaper) + proper bidi (bidi-js
// getReorderedString) so embedded Latin/number runs stay in forward order.
// jsPDF's own bidiEngine mis-orders English-in-Arabic; enableRtlPassthrough
// makes jsPDF draw our pre-reordered string verbatim.
describe('prepareRtl (shaping + bidi)', () => {
  const doc = new jsPDF();

  it('returns empty string for empty input', () => {
    expect(prepareRtl(doc, '')).toBe('');
  });

  it('shapes/reorders pure Arabic (output differs from logical input)', () => {
    const out = prepareRtl(doc, 'الإدارة التسويقية');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe('الإدارة التسويقية');
  });

  it('keeps an embedded English word in FORWARD order (not reversed)', () => {
    const out = prepareRtl(doc, 'باسم PyramediaX رخصة تجارية');
    expect(out).toContain('PyramediaX'); // forward, unbroken
    expect(out).not.toContain('XaidemaryP'); // not reversed
  });

  it('keeps numbers in forward order', () => {
    expect(prepareRtl(doc, 'القيمة 100,000 درهم')).toContain('100,000');
    expect(prepareRtl(doc, 'مدته 30 يوماً للمادة 43')).toMatch(/30.*43|43.*30/);
  });

  it('keeps a parenthetical Latin term forward', () => {
    expect(prepareRtl(doc, 'الأوامر البرمجية (Prompts) والأكواد')).toContain('Prompts');
  });
});

describe('enableRtlPassthrough', () => {
  it('makes jsPDF draw the pre-reordered string verbatim (bidiEngine no-op)', () => {
    const doc = new jsPDF();
    enableRtlPassthrough(doc);
    const visual = prepareRtl(doc, 'باسم PyramediaX رخصة تجارية');

    let drawn = '';
    (doc as unknown as {
      internal: { events: { subscribe: (e: string, f: (p: { text: unknown }) => void) => void } };
    }).internal.events.subscribe('postProcessText', (payload: { text: unknown }) => {
      const t = payload.text;
      drawn = Array.isArray(t) ? t.map((x) => (Array.isArray(x) ? x[0] : x)).join('') : String(t);
    });
    doc.text(visual, 20, 20, { align: 'right' });
    expect(drawn).toBe(visual); // jsPDF did NOT re-reorder our string
  });
});

describe('drawRtlParagraph', () => {
  it('wraps + draws without throwing and advances y', () => {
    const doc = new jsPDF();
    enableRtlPassthrough(doc);
    doc.setFontSize(9);
    const y0 = 20;
    const y1 = drawRtlParagraph(
      doc,
      'شركة بيراميديا إكس (PyramediaX) رخصة تجارية رقم [ 1584491 ] في دبي.',
      { x: 190, y: y0, maxWidth: 90, lineHeight: 5.5, fontSize: 9 },
    );
    expect(y1).toBeGreaterThan(y0);
  });
});
