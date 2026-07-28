import { describe, it, expect } from 'vitest';
import { deepMerge, loadMessageSlice, loadMessages } from '@/lib/i18n/messages';
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

// app/d/[token]/page.tsx narrows its nested <NextIntlClientProvider> to this
// one slice instead of the full ~930 KB merged catalog (final-review
// Important 4) — this pins that loadMessageSlice() actually resolves the
// same content useTranslations('finance.quotes.detail') would get from the
// full catalog, for both locales, and stays small.
describe('loadMessageSlice', () => {
  it('matches the full catalog sub-tree for ar', async () => {
    const full = await loadMessages('ar');
    const slice = await loadMessageSlice('ar', 'finance', 'finance.quotes.detail');
    const expectedDetail = (full.finance as { quotes: { detail: unknown } }).quotes.detail;
    expect(slice).toEqual({ finance: { quotes: { detail: expectedDetail } } });
  });

  it('matches the full catalog sub-tree for en (with the AR-fallback merge applied)', async () => {
    const full = await loadMessages('en');
    const slice = await loadMessageSlice('en', 'finance', 'finance.quotes.detail');
    const expectedDetail = (full.finance as { quotes: { detail: unknown } }).quotes.detail;
    expect(slice).toEqual({ finance: { quotes: { detail: expectedDetail } } });
  });

  it('is a small fraction of the full catalog size', async () => {
    const slice = await loadMessageSlice('en', 'finance', 'finance.quotes.detail');
    const sliceBytes = Buffer.byteLength(JSON.stringify(slice), 'utf8');
    const fullBytes = Buffer.byteLength(JSON.stringify(await loadMessages('en')), 'utf8');
    expect(sliceBytes).toBeLessThan(5_000);
    expect(sliceBytes).toBeLessThan(fullBytes / 50);
  });
});
