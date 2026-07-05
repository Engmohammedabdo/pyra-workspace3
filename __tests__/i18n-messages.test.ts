import { describe, it, expect } from 'vitest';
import { deepMerge } from '@/lib/i18n/messages';
import arCommon from '@/messages/ar/common.json';
import enCommon from '@/messages/en/common.json';

describe('deepMerge (D7 fallback rule)', () => {
  it('override wins on shared keys', () => {
    expect(deepMerge({ a: { x: 'ar' } }, { a: { x: 'en' } })).toEqual({ a: { x: 'en' } });
  });

  it('missing override keys fall back to base (the Arabic-fallback guarantee)', () => {
    expect(deepMerge({ a: { x: 'ar', y: 'ar-only' } }, { a: { x: 'en' } })).toEqual({
      a: { x: 'en', y: 'ar-only' },
    });
  });

  it('merges nested namespaces without dropping siblings', () => {
    const base = { common: { actions: { save: 'حفظ', cancel: 'إلغاء' } } };
    const override = { common: { actions: { save: 'Save' } } };
    expect(deepMerge(base, override)).toEqual({
      common: { actions: { save: 'Save', cancel: 'إلغاء' } },
    });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { x: 1 } };
    deepMerge(base, { a: { x: 2 } });
    expect(base.a.x).toBe(1);
  });
});

// Structural guard: every EN key must exist in AR (AR is the source catalog;
// an EN-only key would silently render for Arabic users too).
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('catalog parity', () => {
  it('en/common.json keys are a subset of ar/common.json keys', () => {
    const ar = new Set(keyPaths(arCommon));
    for (const p of keyPaths(enCommon)) {
      expect(ar.has(p), `EN-only key: ${p}`).toBe(true);
    }
  });
});
