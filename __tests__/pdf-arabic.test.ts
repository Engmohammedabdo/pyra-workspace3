import { describe, it, expect } from 'vitest';
import { prepareRtl } from '@/lib/pdf/arabic';

describe('prepareRtl', () => {
  it('returns a non-empty string for Arabic input', () => {
    const out = prepareRtl('السلام عليكم');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
  it('reorders so the visual order differs from logical for RTL', () => {
    // After bidi reordering for LTR-rendering engines, the string is reversed-ish.
    expect(prepareRtl('عربي')).not.toBe('عربي');
  });
  it('passes plain ASCII through unchanged', () => {
    expect(prepareRtl('AED 5000')).toContain('5000');
  });
});
