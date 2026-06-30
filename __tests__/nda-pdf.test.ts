/**
 * Runtime smoke test for generateNdaPDF.
 *
 * Does NOT assert content correctness — it asserts the generator:
 *  1. Resolves without throwing
 *  2. Returns a Blob with size > 0
 *
 * Covers two cases:
 *  a) Full data (date, address provided)
 *  b) Minimal data (no address → falls back to placeholder)
 */
import { describe, it, expect } from 'vitest';
import { generateNdaPDF, type NdaData } from '@/lib/pdf/nda-pdf';
import { loadServerPdfFonts } from '@/lib/pdf/pdf-assets-server';

const BASE_DATA: NdaData = {
  date: '01/07/2026',
  nameAr: 'أحمد محمد علي',
  idNumber: '784-1234-1234567-1',
  nationality: 'مصري',
  jobTitle: 'مسؤول تسويق رقمي',
  address: 'دبي، الإمارات العربية المتحدة',
  companyName: 'PyramediaX for Marketing & AI Solution L.L.C.',
};

describe('generateNdaPDF (smoke test)', () => {
  it('generates a valid Blob with full data', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateNdaPDF(BASE_DATA, { fonts });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);

  it('generates a valid Blob with minimal data (no address)', async () => {
    const fonts = await loadServerPdfFonts();
    const minimalData: NdaData = {
      date: '15/07/2026',
      nameAr: 'سارة يوسف العلي',
      idNumber: 'AB9876543',
      nationality: 'أردنية',
      jobTitle: 'مصممة جرافيك',
      companyName: 'PyramediaX for Marketing & AI Solution L.L.C.',
      // address intentionally omitted → falls back to placeholder
    };
    const blob = await generateNdaPDF(minimalData, { fonts });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);
});
