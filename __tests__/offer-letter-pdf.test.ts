/**
 * Runtime smoke test for generateOfferLetterPDF.
 *
 * Does NOT assert content correctness — it asserts the generator:
 *  1. Resolves without throwing
 *  2. Returns a Blob with size > 0
 *
 * Covers three cases:
 *  a) Non-sales hire (commission block omitted)
 *  b) Sales hire     (commission block included)
 *  c) Custom clauses (additional terms section)
 */
import { describe, it, expect } from 'vitest';
import { generateOfferLetterPDF, type OfferLetterData } from '@/lib/pdf/offer-letter-pdf';
import { loadServerPdfFonts } from '@/lib/pdf/pdf-assets-server';

const BASE_DATA: OfferLetterData = {
  refNo: '0001',
  year: '2026',
  date: '01/07/2026',
  startDate: '15/07/2026',
  nameEn: 'Ahmed Mohamed Ali',
  nationality: 'Egyptian',
  passport: 'A12345678',
  idNumber: '784-1234-1234567-1',
  titleEn: 'Marketing Executive',
  titleAr: 'مسؤول تسويق',
  deptEn: 'Marketing',
  deptAr: 'التسويق',
  reportsTo: 'Marketing Manager',
  isSales: false,
  basic: 3000,
  housing: 1000,
  transport: 500,
  communication: 300,
  other: 200,
  customClauses: [],
  signatoryName: 'Abdulrahman Mohamed',
  signatoryTitle: 'CEO / المدير التنفيذي',
  companyName: 'PyramediaX — For Management of Marketing',
};

describe('generateOfferLetterPDF (smoke test)', () => {
  it('generates a valid Blob for a non-sales hire', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateOfferLetterPDF(BASE_DATA, { fonts });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);

  it('generates a valid Blob for a sales hire (with commission block)', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateOfferLetterPDF(
      { ...BASE_DATA, isSales: true, titleEn: 'Sales Executive', titleAr: 'مسؤول مبيعات', deptEn: 'Sales', deptAr: 'المبيعات', commissionRate: 10, monthlyTarget: 50000 },
      { fonts },
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);

  it('generates a valid Blob with custom clauses', async () => {
    const fonts = await loadServerPdfFonts();
    const blob = await generateOfferLetterPDF(
      {
        ...BASE_DATA,
        customClauses: [
          { title: 'Remote Work Policy', body: 'يُسمح للموظف بالعمل عن بُعد يومًا واحدًا في الأسبوع بموافقة المدير المباشر.' },
          { body: 'يلتزم الموظف بحضور جميع اجتماعات الفريق الأسبوعية دون استثناء.' },
        ],
      },
      { fonts },
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 30_000);
});
