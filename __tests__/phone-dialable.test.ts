import { describe, it, expect } from 'vitest';
import { toDialableUAE, phoneMatchKey } from '@/lib/utils/phone';

describe('toDialableUAE', () => {
  it('prefixes UAE local 05xxxxxxxx to E.164 (the campaign bug)', () => {
    // The exact defect: 706 of 798 seeded contacts are this shape and were
    // sent to Evolution unprefixed, which returns exists:false and burns them.
    expect(toDialableUAE('0585966299')).toBe('971585966299');
    expect(toDialableUAE('0501234567')).toBe('971501234567');
  });

  it('handles a bare 9-digit significant number', () => {
    expect(toDialableUAE('585966299')).toBe('971585966299');
  });

  it('leaves an already-international number untouched', () => {
    expect(toDialableUAE('971585966299')).toBe('971585966299');
    expect(toDialableUAE('+971 58 596 6299')).toBe('971585966299');
    expect(toDialableUAE('00971585966299')).toBe('971585966299');
  });

  it('returns empty string for unusable input', () => {
    expect(toDialableUAE('')).toBe('');
    expect(toDialableUAE(null)).toBe('');
    expect(toDialableUAE('12')).toBe('');
  });

  it('produces a number whose match key equals the local form’s match key', () => {
    // The invariant that keeps suppression correct across formats: dialable
    // and stored share the last 9 digits.
    expect(phoneMatchKey(toDialableUAE('0585966299'))).toBe(phoneMatchKey('0585966299'));
    expect(phoneMatchKey(toDialableUAE('0585966299'))).toBe(phoneMatchKey('971585966299'));
  });
});
