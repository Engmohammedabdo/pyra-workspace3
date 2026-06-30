/**
 * Runtime smoke test for generateAssetHandoverPDF.
 *
 * Does NOT assert content correctness — it asserts the generator:
 *  1. Resolves without throwing
 *  2. Returns a Blob with size > 0
 *
 * Covers two cases:
 *  a) Two populated asset rows
 *  b) Empty assets array (blank hand-fillable rows)
 */
import { describe, it, expect } from 'vitest';
import { generateAssetHandoverPDF, type AssetHandoverData } from '@/lib/pdf/asset-handover-pdf';
import { loadServerPdfFonts } from '@/lib/pdf/pdf-assets-server';

const BASE_DATA: AssetHandoverData = {
  employeeName: 'أحمد محمد علي',
  jobTitle: 'مسؤول تسويق',
  department: 'التسويق',
  idNumber: '784-1234-1234567-1',
  username: 'ahmed.ali',
  handoverDate: '01/07/2026',
  handoverPlace: 'مكتب الشركة — دبي',
  companyName: 'pyramediaX for marketing managment',
  assets: [
    {
      type: 'لابتوب',
      description: 'MacBook Pro 14" M3',
      serial: 'C02XG0JFJG5M',
      condition: 'جديد',
      value: '8500',
      notes: 'مع الشاحن والحقيبة',
    },
    {
      type: 'هاتف متحرك',
      description: 'iPhone 15 Pro',
      serial: 'F2LXQ1234567',
      condition: 'جديد',
      value: '4200',
      notes: 'مع الكابل والمحول',
    },
  ],
};

describe('generateAssetHandoverPDF (smoke test)', () => {
  it('generates a valid Blob for an employee with 2 assets', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateAssetHandoverPDF(BASE_DATA, { fonts });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);

  it('generates a valid Blob when assets array is empty (blank form)', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateAssetHandoverPDF(
      { ...BASE_DATA, assets: [] },
      { fonts },
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);
});
