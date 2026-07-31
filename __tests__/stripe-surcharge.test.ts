import { describe, it, expect } from 'vitest';
import {
  calcSurcharge,
  normalizeSurchargePercent,
  MAX_SURCHARGE_PERCENT,
} from '@/lib/stripe/surcharge';
import { parseSettingNumber } from '@/lib/settings/parse';
import { splitGross } from '@/lib/stripe/settle';

describe('calcSurcharge', () => {
  it('reproduces the two real transactions', () => {
    // 2026-07-31: DJ offer, 700 @ 4%
    expect(calcSurcharge(700, 4)).toEqual({ surcharge: 28, gross: 728 });
    // 2026-07-25: 5,000 @ 3.5%
    expect(calcSurcharge(5000, 3.5)).toEqual({ surcharge: 175, gross: 5175 });
  });

  it('is a no-op at zero or negative percent', () => {
    expect(calcSurcharge(700, 0)).toEqual({ surcharge: 0, gross: 700 });
    expect(calcSurcharge(700, -5)).toEqual({ surcharge: 0, gross: 700 });
  });

  it('never returns NaN for a non-finite percent', () => {
    expect(calcSurcharge(700, NaN)).toEqual({ surcharge: 0, gross: 700 });
    expect(calcSurcharge(700, Infinity)).toEqual({ surcharge: 0, gross: 700 });
  });

  it('rounds the surcharge to 2dp', () => {
    // 333.33 * 3.5% = 11.666655
    expect(calcSurcharge(333.33, 3.5)).toEqual({ surcharge: 11.67, gross: 345 });
  });

  /**
   * The guard that matters. `gross = round2(base * (1 + pct/100))` is NOT the
   * same as `base + round2(base * pct/100)`. Where they diverge, the payer's
   * receipt would not add up: base + surcharge !== total.
   */
  it('is ADDITIVE — gross always equals base + surcharge, exactly', () => {
    for (let base = 1; base <= 2000; base += 0.37) {
      for (const pct of [3.5, 4, 2.9, 1.75]) {
        const b = Math.round(base * 100) / 100;
        const { surcharge, gross } = calcSurcharge(b, pct);
        expect(Math.round((b + surcharge) * 100) / 100).toBe(gross);
      }
    }
  });

  it('differs from the multiplicative form on at least one known pair', () => {
    // Proof the additive rule is a real decision, not a stylistic one.
    const mult = (b: number, p: number) => Math.round(b * (1 + p / 100) * 100) / 100;
    let divergences = 0;
    for (let cents = 100; cents <= 200000; cents += 7) {
      const b = cents / 100;
      if (calcSurcharge(b, 3.5).gross !== mult(b, 3.5)) divergences++;
    }
    expect(divergences).toBeGreaterThan(0);
  });
});

/**
 * The surcharge must survive the round trip: what we put in session metadata is
 * what splitGross pulls back out at settlement, and the BASE must settle the
 * invoice exactly.
 */
describe('round-trip with splitGross at settlement', () => {
  it('700 @ 4% settles the invoice by exactly 700', () => {
    const { surcharge, gross } = calcSurcharge(700, 4);
    expect(splitGross(gross, String(surcharge))).toEqual({ base: 700, surcharge: 28 });
  });

  it('5000 @ 3.5% settles the invoice by exactly 5000', () => {
    const { surcharge, gross } = calcSurcharge(5000, 3.5);
    expect(splitGross(gross, String(surcharge))).toEqual({ base: 5000, surcharge: 175 });
  });

  it('an awkward base still settles exactly', () => {
    const { surcharge, gross } = calcSurcharge(333.33, 3.5);
    expect(splitGross(gross, String(surcharge))).toEqual({ base: 333.33, surcharge: 11.67 });
  });

  it('a lost metadata value credits the full gross rather than inventing a split', () => {
    // Documents the failure mode: splitGross degrades to surcharge=0, so the
    // invoice would be over-credited. This is why the metadata key is required.
    expect(splitGross(728, undefined)).toEqual({ base: 728, surcharge: 0 });
  });
});

describe('normalizeSurchargePercent', () => {
  it('accepts a valid rate and rounds to 2dp', () => {
    expect(normalizeSurchargePercent(4)).toBe(4);
    expect(normalizeSurchargePercent('3.5')).toBe(3.5);
    expect(normalizeSurchargePercent(2.456)).toBe(2.46);
  });

  it('accepts zero — an explicit "no fee this time"', () => {
    expect(normalizeSurchargePercent(0)).toBe(0);
  });

  it('rejects a fat-fingered rate above the ceiling', () => {
    // 35 instead of 3.5 would charge ten times the intended fee.
    expect(normalizeSurchargePercent(35)).toBeNull();
    expect(normalizeSurchargePercent(MAX_SURCHARGE_PERCENT + 0.01)).toBeNull();
  });

  it('rejects negatives and rubbish', () => {
    expect(normalizeSurchargePercent(-1)).toBeNull();
    expect(normalizeSurchargePercent('abc')).toBeNull();
    expect(normalizeSurchargePercent(null)).toBeNull();
    expect(normalizeSurchargePercent(undefined)).toBeNull();
  });
});

describe('parseSettingNumber', () => {
  it('reads the TEXT column form', () => {
    expect(parseSettingNumber('3.5', 0)).toBe(3.5);
    expect(parseSettingNumber(' 4 ', 0)).toBe(4);
  });

  it('never returns NaN', () => {
    expect(parseSettingNumber('abc', 1)).toBe(1);
    expect(parseSettingNumber('', 1)).toBe(1);
    expect(parseSettingNumber(null, 1)).toBe(1);
    expect(parseSettingNumber(undefined, 1)).toBe(1);
    expect(parseSettingNumber(NaN, 1)).toBe(1);
  });
});
