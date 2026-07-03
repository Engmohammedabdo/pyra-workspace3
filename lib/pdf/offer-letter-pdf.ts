// NOTE: intentionally NOT 'use client' — this is an isomorphic utility (plain
// async function, no React/JSX), used BOTH in the browser AND server-side via
// dynamic import. A 'use client' directive would make the server's `await import()`
// resolve to a client-reference proxy and break server generation.

import jsPDF from 'jspdf';
import { registerArabicFont } from './pdf-fonts';
import { prepareRtl, drawRtlParagraph, drawBilingualClause, enableRtlPassthrough } from './arabic';
import { CURRENCY_LABELS_AR } from '@/lib/constants/auth';

// ============================================================
// Offer Letter PDF — PyramediaX
// Ports the approved offer-letter-generator.html template to jsPDF.
// Bilingual (EN left / AR right), compensation table, optional
// sales commission block, optional custom clauses, auto page breaks.
// ============================================================

export interface OfferLetterData {
  refNo: string;
  year: string;
  date: string;
  startDate: string;
  nameEn: string;
  nationality: string;
  passport: string;
  idNumber: string;
  titleEn: string;
  titleAr: string;
  deptEn: string;
  deptAr: string;
  reportsTo: string;
  isSales: boolean;
  basic: number;
  housing: number;
  transport: number;
  communication: number;
  other: number;
  commissionRate?: number;
  monthlyTarget?: number;
  /** ISO 4217 currency code for all amounts (default 'AED'). */
  currency?: string;
  customClauses: Array<{ title?: string; body: string }>;
  signatoryName: string;
  signatoryTitle: string;
  companyName: string;
}

/* ── Design tokens ── */
const ORANGE: [number, number, number] = [249, 115, 22];
const GOLD: [number, number, number] = [201, 168, 76];
const DARK: [number, number, number] = [17, 17, 17];
const GRAY: [number, number, number] = [100, 100, 100];
const LIGHT_BG: [number, number, number] = [253, 250, 243];
const TOTAL_BG: [number, number, number] = [255, 248, 232];
const WHITE: [number, number, number] = [255, 255, 255];
const BORDER: [number, number, number] = [224, 216, 200];

const PAGE_W = 210;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 278;
const TOP_Y = 22;

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ensure there is `needed` mm of space left; add page if not. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > BOTTOM) {
    doc.addPage();
    return TOP_Y;
  }
  return y;
}

/**
 * Draw a numbered section heading (bold, gold underline).
 * EN part drawn left in helvetica; AR part drawn right in Amiri.
 * Returns y after the heading.
 */
function drawSectionHeading(doc: jsPDF, num: number, enTitle: string, arTitle: string, y: number): number {
  y = ensureSpace(doc, y, 14);
  doc.setFontSize(10);
  // English number + title — helvetica, left-aligned
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text(`${num}. ${enTitle}`, MARGIN, y + 6);
  // Arabic title — Amiri, right-aligned
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,arTitle), PAGE_W - MARGIN, y + 6, { align: 'right' });
  // gold underline
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 8, PAGE_W - MARGIN, y + 8);
  return y + 13;
}

/**
 * Draw a bilingual clause line (EN left, AR right).
 * Returns new y.
 */
function drawClause(doc: jsPDF, en: string, ar: string, y: number): number {
  y = ensureSpace(doc, y, 10);
  return drawBilingualClause(doc, en, ar, {
    xLeft: MARGIN,
    xRight: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W / 2 - 2,
    lineHeight: 5.5,
  });
}

/**
 * Draw a single info line: left-side label+value in helvetica, right-side
 * Arabic text right-aligned (for bilingual info fields).
 */
function drawInfoLine(doc: jsPDF, leftText: string, rightAr: string, y: number): number {
  y = ensureSpace(doc, y, 7);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK);
  doc.text(leftText, MARGIN, y);
  if (rightAr) {
    doc.setFont('Amiri', 'normal');
    doc.text(prepareRtl(doc,rightAr), PAGE_W - MARGIN, y, { align: 'right' });
  }
  return y + 6;
}

export async function generateOfferLetterPDF(
  data: OfferLetterData,
  opts?: { fonts?: { regular: string; bold: string }; defaultLogo?: string },
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await registerArabicFont(doc, opts?.fonts);
  enableRtlPassthrough(doc); // we do bidi via bidi-js; jsPDF must not re-reorder

  // ─────────────────────────────────────────────
  // HEADER BAR
  // ─────────────────────────────────────────────
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, PAGE_W, 30, 'F');

  // Logo (top-right) or text fallback
  if (opts?.defaultLogo) {
    try {
      const imgFmt = opts.defaultLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.defaultLogo, imgFmt, PAGE_W - MARGIN - 30, 4, 28, 12);
    } catch {
      // ignore — logo embed failure is non-fatal
    }
  }

  // Company name in header (Arabic above, English below)
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'بايراميديا إكس — للإدارة التسويقية'), PAGE_W / 2, 12, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(data.companyName || 'PyramediaX — For Management of Marketing', PAGE_W / 2, 20, { align: 'center' });
  doc.setFontSize(7);
  doc.text('Dubai, United Arab Emirates  |  hr@pyramedia.info', PAGE_W / 2, 27, { align: 'center' });

  let y = 36;

  // ─────────────────────────────────────────────
  // DOCUMENT TITLE
  // ─────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('OFFER OF EMPLOYMENT', PAGE_W / 2, y + 6, { align: 'center' });
  y += 8;
  doc.setFontSize(11);
  doc.setFont('Amiri', 'normal');
  doc.text(prepareRtl(doc,'عرض توظيف'), PAGE_W / 2, y + 5, { align: 'center' });
  y += 9;

  // Gold underline below title
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN + 20, y, PAGE_W - MARGIN - 20, y);
  y += 5;

  // ─────────────────────────────────────────────
  // REF ROW
  // ─────────────────────────────────────────────
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text(`Reference No: PYR-OL-${data.refNo}/${data.year}`, MARGIN, y);
  doc.text(`Date: ${data.date}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // ─────────────────────────────────────────────
  // DEAR + EMPLOYEE INFO BLOCK
  // ─────────────────────────────────────────────
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  // "Dear:" in helvetica left; Arabic greeting right in Amiri
  y = drawInfoLine(doc, 'Dear:', 'عزيزي(تي):', y);

  // Name: EN name in helvetica left; Arabic label right in Amiri
  y = drawInfoLine(doc, `Name: ${data.nameEn}`, 'الاسم', y);

  // Nationality / Passport / ID — data.nationality may be Arabic, so put it on the Amiri side
  doc.setFontSize(8.5);
  y = drawInfoLine(doc, 'Nationality:', `الجنسية: ${data.nationality}`, y);
  y = drawInfoLine(doc, `Passport No: ${data.passport}`, 'رقم الجواز', y);
  y = drawInfoLine(doc, `ID No: ${data.idNumber}`, 'رقم الهوية', y);
  y += 2;

  // ─────────────────────────────────────────────
  // INTRO TEXT
  // ─────────────────────────────────────────────
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 4;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK);
  const introEn = 'We are pleased to offer you employment at PyramediaX — For Management of Marketing on the following terms and conditions:';
  const introLines: string[] = doc.splitTextToSize(introEn, CONTENT_W);
  for (const line of introLines) {
    doc.text(line, MARGIN, y);
    y += 5.5;
  }
  y += 1;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'يسعدنا أن نعرض عليك العمل في شركة بايراميديا إكس — للإدارة التسويقية وفقاً للشروط والأحكام التالية:', {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
  });
  y += 4;

  // ─────────────────────────────────────────────
  // BUILD VISIBLE SECTION LIST (dynamic numbering)
  // ─────────────────────────────────────────────
  type SectionKey =
    | 'position'
    | 'contract'
    | 'probation'
    | 'compensation'
    | 'commission'
    | 'working_hours'
    | 'annual_leave'
    | 'other_benefits'
    | 'termination'
    | 'confidentiality'
    | 'media_rights'
    | 'work_location'
    | 'general_terms'
    | 'custom_clauses';

  const sections: SectionKey[] = [
    'position',
    'contract',
    'probation',
    'compensation',
    ...(data.isSales ? (['commission'] as SectionKey[]) : []),
    'working_hours',
    'annual_leave',
    'other_benefits',
    'termination',
    'confidentiality',
    'media_rights',
    'work_location',
    'general_terms',
    ...(data.customClauses.length > 0 ? (['custom_clauses'] as SectionKey[]) : []),
  ];

  const snum = (key: SectionKey): number => sections.indexOf(key) + 1;

  // Currency code governing all amounts (defaults to AED for legacy offer_data)
  const cur = data.currency || 'AED';

  // Monthly / annual totals
  const monthly = data.basic + data.housing + data.transport + data.communication + data.other;
  const annual = monthly * 12;

  // ─────────────────────────────────────────────
  // SECTION — POSITION
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('position'), 'Position', 'المسمى الوظيفي', y);
  y = drawInfoLine(doc, `Job Title: ${data.titleEn}`, `المسمى: ${data.titleAr}`, y);
  y = drawInfoLine(doc, `Department: ${data.deptEn}`, `القسم: ${data.deptAr}`, y);
  y = drawInfoLine(doc, `Reporting to: ${data.reportsTo}`, 'المسؤول المباشر', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — CONTRACT TYPE & DURATION
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('contract'), 'Contract Type & Duration', 'نوع العقد والمدة', y);
  y = drawInfoLine(doc, 'Contract Type: Fixed-Term', 'نوع العقد: محدد المدة', y);
  y = drawInfoLine(doc, 'Duration: One (1) Year', 'المدة: سنة واحدة', y);
  y = drawInfoLine(doc, `Start Date: ${data.startDate}`, 'تاريخ البدء', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — PROBATION PERIOD
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('probation'), 'Probation Period', 'فترة التجربة', y);
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...DARK);
  y = drawRtlParagraph(doc, 'يخضع الموظف لفترة تجربة مدتها ثلاثة (3) أشهر تبدأ من تاريخ مباشرة العمل، وذلك وفقًا للمادة 9 من المرسوم بقانون اتحادي رقم 33 لسنة 2021 وتعديلاته، على ألا تتجاوز فترة التجربة في جميع الأحوال ستة (6) أشهر.', {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
  });
  y += 2;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'ويجوز لصاحب العمل خلال فترة التجربة إنهاء خدمة الموظف بموجب إشعار خطي مسبق لا يقل عن أربعة عشر (14) يومًا.', {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
  });
  y += 2;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'أما إذا رغب الموظف في إنهاء عقد العمل خلال فترة التجربة للانتقال إلى صاحب عمل آخر داخل الدولة، فيلتزم بإشعار خطي مسبق لا يقل عن شهر واحد. وإذا رغب في إنهاء العقد خلال فترة التجربة لمغادرة الدولة، فيلتزم بإشعار خطي مسبق لا يقل عن أربعة عشر (14) يومًا.', {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
  });
  y += 4;

  // ─────────────────────────────────────────────
  // SECTION — COMPENSATION TABLE
  // ─────────────────────────────────────────────
  y = ensureSpace(doc, y, 55);
  y = drawSectionHeading(doc, snum('compensation'), 'Compensation Package', 'حزمة التعويضات', y);

  const col0 = MARGIN;
  const col1 = MARGIN + CONTENT_W * 0.52;
  const col2 = PAGE_W - MARGIN;
  const rowH = 8;

  // Table header
  doc.setFillColor(...GOLD);
  doc.rect(col0, y, CONTENT_W, rowH, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  // "Component" in helvetica left; Arabic label in Amiri right (within the first column)
  doc.setFont('helvetica', 'bold');
  doc.text('Component', col0 + 3, y + 5.5);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'البند'), col1 - 3, y + 5.5, { align: 'right' });
  // Amount columns — Latin only, helvetica
  doc.setFont('helvetica', 'bold');
  doc.text(`Monthly (${cur})`, col1 + 3, y + 5.5);
  doc.text(`Annual (${cur})`, col2, y + 5.5, { align: 'right' });
  y += rowH;

  // Compensation rows
  const compRows: Array<{ en: string; ar: string; monthly: number }> = [
    { en: 'Basic Salary', ar: 'الراتب الأساسي', monthly: data.basic },
    { en: 'Housing Allowance', ar: 'بدل سكن', monthly: data.housing },
    { en: 'Transportation Allowance', ar: 'بدل نقل', monthly: data.transport },
    { en: 'Communication Allowance', ar: 'بدل اتصالات', monthly: data.communication },
    { en: 'Other Allowance', ar: 'بدل أخرى', monthly: data.other },
  ];

  compRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(col0, y, CONTENT_W, rowH, 'F');
    }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    // Label: EN / AR inline
    const enLabel = `${row.en} / `;
    doc.text(enLabel, col0 + 3, y + 5.5);
    const enW = doc.getTextWidth(enLabel);
    doc.setFont('Amiri', 'normal');
    doc.text(prepareRtl(doc,row.ar), col0 + 3 + enW, y + 5.5);
    // Amounts
    doc.setFont('helvetica', 'normal');
    doc.text(fmt(row.monthly), col1 + 3, y + 5.5);
    doc.text(fmt(row.monthly * 12), col2, y + 5.5, { align: 'right' });
    y += rowH;
  });

  // Total row
  doc.setFillColor(...TOTAL_BG);
  doc.rect(col0, y, CONTENT_W, rowH, 'F');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(col0, y, col0 + CONTENT_W, y);
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  // "TOTAL" in helvetica left; Arabic "الإجمالي" in Amiri right (within label column)
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', col0 + 3, y + 5.5);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'الإجمالي'), col1 - 3, y + 5.5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(monthly), col1 + 3, y + 5.5);
  doc.text(fmt(annual), col2, y + 5.5, { align: 'right' });
  y += rowH + 4;

  // ─────────────────────────────────────────────
  // SECTION — SALES COMMISSION (isSales only)
  // ─────────────────────────────────────────────
  if (data.isSales) {
    y = ensureSpace(doc, y, 14);
    y = drawSectionHeading(doc, snum('commission'), 'Sales Commission Structure', 'هيكل عمولة المبيعات', y);

    const commRate = data.commissionRate ?? 10;
    const target = data.monthlyTarget ?? 50000;

    y = drawClause(doc,
      `a) Commission Rate: ${commRate}% of the total value of closed sales made by the Employee.`,
      `نسبة العمولة: ${commRate}% من إجمالي قيمة المبيعات المغلقة من قبل الموظف.`,
      y);
    y = drawClause(doc,
      'b) Payment Condition: Commission shall be paid ONLY after the client has paid 100% of the full contract value.',
      'شرط الدفع: تُدفع العمولة فقط بعد قيام العميل بدفع 100% من كامل قيمة عقده.',
      y);
    y = drawClause(doc,
      'c) Exclusions: Commission does NOT include printing services revenue. Only marketing, AI solutions, and digital services revenue shall be commission-eligible.',
      'الاستثناءات: لا تشمل العمولة إيرادات خدمات المطبوعات. تشمل فقط إيرادات خدمات التسويق وحلول الذكاء الاصطناعي والخدمات الرقمية.',
      y);
    y = drawClause(doc,
      `d) Monthly Sales Target: ${cur} ${fmt(target)}`,
      `الهدف البيعي الشهري: ${fmt(target)} ${CURRENCY_LABELS_AR[cur] ?? cur}`,
      y);
    y = drawClause(doc,
      'e) Probation Period Compensation: Commission is earned solely on closed and collected sales. Should the Employee not close any sales deal during the three (3) month probation period, the Employee shall be entitled to the fixed basic salary only for that period, with no commission.',
      'تعويضات فترة التجربة: تُكتسب العمولة فقط على المبيعات المُغلقة والمُحصّلة. وفي حال عدم إغلاق الموظف لأي صفقة بيع خلال فترة التجربة البالغة ثلاثة (3) أشهر، يستحق الراتب الأساسي الثابت فقط عن تلك الفترة دون أي عمولة.',
      y);

    // Clause f — highlighted box (orange-tinted)
    y = ensureSpace(doc, y, 35);
    doc.setFillColor(255, 244, 224);
    doc.setDrawColor(232, 118, 26);
    doc.setLineWidth(0.5);
    const fEnText = 'f) Condition of Confirmation (Probation): Closing at least one (1) sales deal — or building a qualified sales pipeline acceptable to the Company — within the three (3) month probation period shall be a condition for the confirmation of employment. Should the Employee fail to meet this condition, the Company may terminate the contract during the probation period by providing fourteen (14) days written notice, in accordance with Clause 3 above. Wages for the period actually worked shall be paid in full in accordance with UAE Labour Law.';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const fEnLines: string[] = doc.splitTextToSize(fEnText, CONTENT_W - 6);
    const fBoxH = fEnLines.length * 4.5 + 8;
    doc.rect(MARGIN, y, CONTENT_W, fBoxH, 'FD');
    let fy = y + 5;
    doc.setTextColor(...DARK);
    for (const l of fEnLines) {
      doc.text(l, MARGIN + 3, fy);
      fy += 4.5;
    }
    y += fBoxH + 1;
    // Arabic for clause f
    doc.setFont('Amiri', 'normal');
    y = drawRtlParagraph(doc, 'شرط التثبيت (فترة التجربة): يُعدّ إغلاق صفقة بيع واحدة على الأقل — أو بناء خط مبيعات (Pipeline) مؤهّل ومقبول من الشركة — خلال فترة التجربة البالغة ثلاثة (3) أشهر شرطًا لتثبيت الموظف. وفي حال عدم تحقيق هذا الشرط، يحق للشركة إنهاء العقد خلال فترة التجربة بموجب إشعار خطي مسبق مدته أربعة عشر (14) يومًا وفقاً للبند (3) أعلاه. وتُصرف أجور الفترة التي عمل بها الموظف فعليًا بالكامل وفقًا لقانون العمل الإماراتي.', {
      x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
    });
    y += 3;

    // Note box (gold left border, light gold bg)
    y = ensureSpace(doc, y, 22);
    doc.setFillColor(255, 248, 232);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.2);
    const noteEnText = 'Note: Failure to meet the monthly sales target for three (3) consecutive months may result in performance review and potential termination in accordance with UAE Labor Law.';
    const noteEnLines: string[] = doc.splitTextToSize(noteEnText, CONTENT_W / 2 - 8);
    const noteArText = 'ملاحظة: عدم تحقيق الهدف البيعي لثلاثة (3) أشهر متتالية قد يؤدي إلى مراجعة الأداء وإنهاء العلاقة التعاقدية وفقاً لقانون العمل الإماراتي.';
    const noteH = Math.max(noteEnLines.length * 5 + 6, 20);
    doc.rect(MARGIN, y, CONTENT_W, noteH, 'FD');
    // Gold left accent
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(MARGIN, y, MARGIN, y + noteH);
    doc.setLineWidth(0.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    let ny = y + 5;
    for (const l of noteEnLines) {
      doc.text(l, MARGIN + 4, ny);
      ny += 5;
    }
    // Arabic note on right half
    doc.setFont('Amiri', 'normal');
    drawRtlParagraph(doc, noteArText, {
      x: PAGE_W - MARGIN - 2, y: y + 5, maxWidth: CONTENT_W / 2 - 6, lineHeight: 5,
    });
    y += noteH + 3;
  }

  // ─────────────────────────────────────────────
  // SECTION — WORKING HOURS & DAYS
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('working_hours'), 'Working Hours & Days', 'ساعات وأيام العمل', y);
  y = drawClause(doc, 'Working Hours: 10:00 AM to 6:00 PM (8 hours per day)', 'ساعات العمل: من 10:00 صباحاً حتى 6:00 مساءً (8 ساعات يومياً)', y);
  y = drawClause(doc, 'Working Days: Monday to Saturday (6 days/week)', 'أيام العمل: من الاثنين إلى السبت (6 أيام في الأسبوع)', y);
  y = drawClause(doc, 'Day Off: Sunday', 'يوم الراحة: الأحد', y);
  y = drawClause(doc, 'During Ramadan, working hours shall be reduced by two (2) hours per day as per Article 17.', 'خلال رمضان، تُخفض ساعات العمل بواقع ساعتين يومياً وفقاً للمادة 17.', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — ANNUAL LEAVE
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('annual_leave'), 'Annual Leave', 'الإجازة السنوية', y);
  y = drawClause(doc, '• Two (2) days per month if service < 1 year', '• يومان عن كل شهر إذا كانت الخدمة أقل من سنة', y);
  y = drawClause(doc, '• Thirty (30) days per year if service > 1 year', '• 30 يوماً سنوياً إذا تجاوزت الخدمة سنة', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — OTHER BENEFITS
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('other_benefits'), 'Other Benefits', 'مزايا أخرى', y);
  y = drawClause(doc, 'a) End of Service Gratuity: As per Articles 51-53.', 'مكافأة نهاية الخدمة وفقاً للمواد 51-53.', y);
  y = drawClause(doc, 'b) Sick Leave: 90 days/year (15 full pay, 30 half pay, 45 unpaid) as per Article 31.', 'الإجازة المرضية: 90 يوماً/سنة (15 بأجر كامل، 30 بنصف أجر، 45 بدون أجر) وفقاً للمادة 31.', y);
  y = drawClause(doc, 'c) Public Holidays: As declared by the UAE Government.', 'العطلات الرسمية حسب إعلان الحكومة الإماراتية.', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — TERMINATION & NOTICE PERIOD
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('termination'), 'Termination & Notice Period', 'إنهاء العقد', y);
  y = drawClause(doc, 'After probation, either party may terminate by providing thirty (30) days written notice as per Article 43.', 'بعد فترة التجربة، يحق لأي من الطرفين إنهاء العقد بموجب إشعار خطي مدته 30 يوماً وفقاً للمادة 43.', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — CONFIDENTIALITY & NDA
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('confidentiality'), 'Confidentiality & NDA', 'السرية', y);
  y = drawClause(doc, 'The Employee shall sign a separate Non-Disclosure Agreement (NDA) and maintain strict confidentiality.', 'يلتزم الموظف بتوقيع اتفاقية عدم إفشاء (NDA) والحفاظ على سرية تامة.', y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — MEDIA & IMAGE RIGHTS
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('media_rights'), 'Media & Image Rights', 'حقوق الصورة والمواد الإعلامية', y);
  const mediaEn = "By signing this offer, the Employee irrevocably consents to and grants PyramediaX — For Management of Marketing the full and unconditional right to photograph and record the Employee (image and voice) and to use, publish, broadcast, display, and re-use any photographs, videos, and produced materials in which the Employee appears, across all media and platforms — including but not limited to social media, advertising and promotional materials, and the Company's own content — without time or geographic limitation and without additional compensation. Full intellectual property ownership of all such materials shall vest in PyramediaX — For Management of Marketing, and the Employee shall have no claim to any rights or compensation in relation thereto, whether during or after the term of employment.";
  const mediaAr = 'يقرّ الموظف ويوافق بموجب توقيعه على هذا العرض على منح شركة بايراميديا إكس — للإدارة التسويقية الحق الكامل وغير المشروط في تصويره (صوتًا وصورة) واستخدام صوره ومقاطعه المرئية والمواد المُصوَّرة التي يظهر بها، ونشرها وعرضها وإعادة استخدامها في كافة الوسائل والمنصّات، بما في ذلك على سبيل المثال لا الحصر منصّات التواصل الاجتماعي والمواد الإعلانية والترويجية والمحتوى الخاص بالشركة، دون حدٍّ زمني أو جغرافي ودون مقابل إضافي. وتعود الملكية الفكرية الكاملة لجميع هذه المواد إلى شركة بايراميديا إكس — للإدارة التسويقية، ولا يحق للموظف المطالبة بأي حقوق أو تعويضات تتعلق بها سواء أثناء فترة عمله أو بعد انتهائها.';
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK);
  const mediaEnLines: string[] = doc.splitTextToSize(mediaEn, CONTENT_W);
  for (const line of mediaEnLines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, MARGIN, y);
    y += 5;
  }
  y += 1;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, mediaAr, {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5.5, fontSize: 9,
  });
  y += 3;

  // ─────────────────────────────────────────────
  // SECTION — WORK LOCATION
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('work_location'), 'Work Location', 'مكان العمل', y);
  y = drawClause(doc,
    'Primary location: Company Office, Dubai, UAE. Field visits as part of sales duties.',
    'مكان العمل الأساسي: مكتب الشركة، دبي، الإمارات العربية المتحدة.',
    y);
  y += 2;

  // ─────────────────────────────────────────────
  // SECTION — GENERAL TERMS
  // ─────────────────────────────────────────────
  y = drawSectionHeading(doc, snum('general_terms'), 'General Terms', 'أحكام عامة', y);
  y = drawClause(doc, 'a) The Employee shall comply with all Company policies.', 'يلتزم الموظف بكافة سياسات الشركة.', y);
  y = drawClause(doc, 'b) Governed by UAE laws, Federal Decree-Law No. 33 of 2021.', 'يخضع هذا العرض لقوانين دولة الإمارات، المرسوم بقانون اتحادي رقم 33 لسنة 2021.', y);
  y = drawClause(doc, 'c) This offer is valid for seven (7) days from issuance.', 'هذا العرض صالح لمدة سبعة (7) أيام من تاريخ إصداره.', y);
  y += 3;

  // ─────────────────────────────────────────────
  // SECTION — CUSTOM CLAUSES (conditional)
  // ─────────────────────────────────────────────
  if (data.customClauses.length > 0) {
    y = drawSectionHeading(doc, snum('custom_clauses'), 'Additional Terms', 'بنود إضافية', y);
    data.customClauses.forEach((clause, idx) => {
      y = ensureSpace(doc, y, 10);
      if (clause.title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(`${idx + 1}. ${clause.title}`, MARGIN, y);
        y += 5.5;
      } else {
        // Just the number prefix
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(`${idx + 1}.`, MARGIN, y);
        y += 5.5;
      }
      // Body — treat as Arabic RTL text
      doc.setFont('Amiri', 'normal');
      y = drawRtlParagraph(doc, clause.body, {
        x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W - 4, lineHeight: 5.5, fontSize: 9,
      });
      y += 2;
    });
    y += 2;
  }

  // ─────────────────────────────────────────────
  // ACCEPTANCE SECTION
  // ─────────────────────────────────────────────
  y = ensureSpace(doc, y, 72);
  // Gold top border
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  // "ACCEPTANCE" in helvetica left; Arabic heading in Amiri right — centered pair
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.text('ACCEPTANCE', MARGIN, y);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'القبول'), PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;

  // English acceptance text in helvetica
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  const acceptEnText = 'I, the undersigned, hereby accept the above offer and agree to all terms and conditions.';
  const acceptEnLines: string[] = doc.splitTextToSize(acceptEnText, CONTENT_W);
  for (const l of acceptEnLines) {
    doc.text(l, MARGIN, y);
    y += 5;
  }
  // Arabic acceptance text in Amiri
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'أنا الموقع أدناه، أقبل بعرض التوظيف وأوافق على جميع الشروط والأحكام.', {
    x: PAGE_W - MARGIN, y, maxWidth: CONTENT_W, lineHeight: 5, fontSize: 9,
  });
  y += 4;

  // Signature table — two columns
  const sigColW = (CONTENT_W - 4) / 2;
  const sigH = 44;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, sigColW, sigH, 'S');
  doc.rect(MARGIN + sigColW + 4, y, sigColW, sigH, 'S');

  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  // Left box label: EN in helvetica, then AR in Amiri on the same baseline
  doc.setFont('helvetica', 'bold');
  doc.text('For the Company', MARGIN + 3, y + 6);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'عن الشركة'), MARGIN + sigColW - 3, y + 6, { align: 'right' });
  // Right box label
  doc.setFont('helvetica', 'bold');
  doc.text('Employee', MARGIN + sigColW + 7, y + 6);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'الموظف'), MARGIN + sigColW + 4 + sigColW - 3, y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);

  // Company signature block
  doc.text(data.signatoryName, MARGIN + 3, y + 18);
  doc.text(data.signatoryTitle, MARGIN + 3, y + 24);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 3, y + 32, MARGIN + sigColW - 3, y + 32);
  doc.text('Signature', MARGIN + 3, y + 36);
  doc.text('Date: ____/____/____', MARGIN + 3, y + 41);

  // Employee signature block
  doc.text(`Name: ${data.nameEn}`, MARGIN + sigColW + 7, y + 14);
  doc.text(`Passport: ${data.passport}`, MARGIN + sigColW + 7, y + 20);
  doc.line(MARGIN + sigColW + 7, y + 32, PAGE_W - MARGIN - 3, y + 32);
  doc.text('Signature', MARGIN + sigColW + 7, y + 36);
  doc.text('Date: ____/____/____', MARGIN + sigColW + 7, y + 41);

  y += sigH + 6;

  // ─────────────────────────────────────────────
  // FOOTER on all pages
  // ─────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, 284, PAGE_W - MARGIN, 284);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text(
      'PyramediaX For Management of Marketing — Dubai, UAE  |  hr@pyramedia.info  |  www.pyramedia.info',
      PAGE_W / 2, 288, { align: 'center' },
    );
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, 288, { align: 'right' });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  y; // suppress TS 'y assigned but never used' warning

  return doc.output('blob');
}
