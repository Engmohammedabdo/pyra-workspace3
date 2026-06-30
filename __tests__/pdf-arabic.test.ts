import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { prepareRtl } from '@/lib/pdf/arabic';

// prepareRtl now delegates to jsPDF's built-in doc.processArabic() (the proven
// quote/invoice path). processArabic is a pure string transform — it shapes +
// reorders without needing the Amiri font registered, so a bare jsPDF instance
// is enough for these assertions.
describe('prepareRtl', () => {
  const doc = new jsPDF();

  it('returns a non-empty string for Arabic input', () => {
    const out = prepareRtl(doc, 'السلام عليكم');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('shapes/reorders Arabic so the output differs from the logical input', () => {
    expect(prepareRtl(doc, 'عربي')).not.toBe('عربي');
  });

  it('passes plain ASCII digits through', () => {
    expect(prepareRtl(doc, 'AED 5000')).toContain('5000');
  });

  it('returns empty string for empty input', () => {
    expect(prepareRtl(doc, '')).toBe('');
  });
});
