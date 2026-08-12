import { describe, expect, it } from 'vitest';
import { shouldRequireNextStep, NEXT_STEP_ENFORCED_FROM_VERSION } from '@/lib/mobile/next-step-gate';

/**
 * The gate that keeps a server-first deploy from breaking the live fleet.
 * versionCode 10 was on both handsets when this shipped.
 */
describe('shouldRequireNextStep', () => {
  it('is OFF for the fleet that cannot send the field', () => {
    expect(shouldRequireNextStep('10')).toBe(false);
  });

  it('is ON from the version that can', () => {
    expect(shouldRequireNextStep(String(NEXT_STEP_ENFORCED_FROM_VERSION))).toBe(true);
    expect(shouldRequireNextStep('12')).toBe(true);
  });

  it('fails OPEN on a missing or unreadable header', () => {
    // An unknown client is treated as old. Failing closed here would reject
    // real work over a header problem, and the app enforces this in its UI
    // anyway — the server gate is a backstop, not the primary control.
    expect(shouldRequireNextStep(null)).toBe(false);
    expect(shouldRequireNextStep('')).toBe(false);
    expect(shouldRequireNextStep('abc')).toBe(false);
    expect(shouldRequireNextStep('-1')).toBe(false);
  });
});
