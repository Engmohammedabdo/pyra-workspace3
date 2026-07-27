import { describe, it, expect } from 'vitest';
import {
  validateEvidenceFile,
  isPdfMagic,
  MAX_EVIDENCE_BYTES,
} from '@/lib/quotes/evidence-upload';

describe('validateEvidenceFile', () => {
  it('accepts a PDF under the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: 1024 })).toEqual({
      ok: true,
      ext: 'pdf',
    });
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: MAX_EVIDENCE_BYTES })).toEqual({
      ok: true,
      ext: 'pdf',
    });
  });

  it('rejects one byte over the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: MAX_EVIDENCE_BYTES + 1 })).toEqual(
      { ok: false, reason: 'too_large' },
    );
  });

  it('rejects SVG, which can carry script', () => {
    expect(validateEvidenceFile({ type: 'image/svg+xml', size: 100 })).toEqual({
      ok: false,
      reason: 'bad_mime',
    });
  });

  it('rejects an unknown MIME type', () => {
    expect(validateEvidenceFile({ type: 'application/zip', size: 100 })).toEqual({
      ok: false,
      reason: 'bad_mime',
    });
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('maps %s to exactly one canonical extension', (mime, ext) => {
    expect(validateEvidenceFile({ type: mime, size: 100 })).toEqual({ ok: true, ext });
  });
});

describe('isPdfMagic', () => {
  it('accepts a real PDF header', () => {
    expect(isPdfMagic(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
  });

  it('rejects a JPEG header', () => {
    expect(isPdfMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(false);
  });

  it('rejects a buffer shorter than the magic bytes', () => {
    expect(isPdfMagic(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});
