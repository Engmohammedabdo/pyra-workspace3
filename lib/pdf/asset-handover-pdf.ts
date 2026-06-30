// NOTE: intentionally NOT 'use client' — this is an isomorphic utility (plain
// async function, no React/JSX), used BOTH in the browser AND server-side via
// dynamic import. A 'use client' directive would make the server's `await import()`
// resolve to a client-reference proxy and break server generation.

import jsPDF from 'jspdf';
import { registerArabicFont } from './pdf-fonts';
import { prepareRtl, drawRtlParagraph } from './arabic';

// ============================================================
// Employee Asset Custody & Handover Form — PyramediaX
// Bilingual (Arabic primary / English appendix), asset table,
// employee obligations, UAE legal references, signature block.
// ============================================================

export interface AssetHandoverData {
  employeeName: string;
  jobTitle: string;
  department: string;
  idNumber: string;
  username: string;
  handoverDate: string;
  handoverPlace?: string;
  assets: Array<{
    type: string;
    description: string;
    serial: string;
    condition: string;
    value: string;
    notes: string;
  }>;
  companyName: string; // 'pyramediaX for marketing managment'
}

/* ── Design tokens ── */
const ORANGE: [number, number, number] = [249, 115, 22];
const GOLD: [number, number, number] = [201, 168, 76];
const DARK: [number, number, number] = [17, 17, 17];
const GRAY: [number, number, number] = [100, 100, 100];
const LIGHT_BG: [number, number, number] = [253, 250, 243];
const TABLE_HEADER_BG: [number, number, number] = [201, 168, 76];
const WHITE: [number, number, number] = [255, 255, 255];
const BORDER: [number, number, number] = [224, 216, 200];

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 278;
const TOP_Y = 22;

/** Ensure there is `needed` mm of space left; add page if not. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > BOTTOM) {
    doc.addPage();
    return TOP_Y;
  }
  return y;
}

/**
 * Draw a section heading with Arabic title, gold underline.
 * Returns y after the heading.
 */
function drawSectionHeadingAr(doc: jsPDF, arTitle: string, y: number): number {
  y = ensureSpace(doc, y, 12);
  doc.setFontSize(10.5);
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...DARK);
  doc.text(prepareRtl(doc,arTitle), PAGE_W - MARGIN, y + 5, { align: 'right' });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 7, PAGE_W - MARGIN, y + 7);
  return y + 12;
}

/**
 * Draw a field row: Arabic label (right) + value (right, after label).
 * Returns new y.
 */
function drawFieldRow(doc: jsPDF, label: string, value: string, y: number): number {
  y = ensureSpace(doc, y, 7);
  doc.setFontSize(9);
  doc.setFont('Amiri', 'normal');
  doc.setTextColor(...DARK);
  // label bold, value normal — both right-aligned, label first
  doc.setFont('Amiri', 'bold');
  const labelShaped = prepareRtl(doc,label + ': ');
  const labelW = doc.getTextWidth(labelShaped);
  doc.text(labelShaped, PAGE_W - MARGIN, y, { align: 'right' });
  doc.setFont('Amiri', 'normal');
  const valShaped = prepareRtl(doc,value);
  doc.text(valShaped, PAGE_W - MARGIN - labelW, y, { align: 'right' });
  // light separator line
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  return y + 6.5;
}

/**
 * Draw a numbered Arabic paragraph (obligation item).
 * Returns new y.
 */
function drawNumberedParagraph(doc: jsPDF, num: number, text: string, y: number): number {
  y = ensureSpace(doc, y, 10);
  // Draw number on the right side
  doc.setFontSize(9);
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...DARK);
  const numStr = `${num}.`;
  doc.text(prepareRtl(doc,numStr), PAGE_W - MARGIN, y, { align: 'right' });
  const numW = doc.getTextWidth(numStr) + 3;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, text, {
    x: PAGE_W - MARGIN - numW,
    y,
    maxWidth: CONTENT_W - numW,
    lineHeight: 5.5,
    fontSize: 9,
  });
  return y + 1;
}

export async function generateAssetHandoverPDF(
  data: AssetHandoverData,
  opts?: { fonts?: { regular: string; bold: string }; defaultLogo?: string },
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await registerArabicFont(doc, opts?.fonts);

  // ─────────────────────────────────────────────
  // HEADER BAR
  // ─────────────────────────────────────────────
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, PAGE_W, 30, 'F');

  // Logo (top-left in LTR / visual left) or text fallback
  if (opts?.defaultLogo) {
    try {
      const imgFmt = opts.defaultLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.defaultLogo, imgFmt, MARGIN, 4, 28, 12);
    } catch {
      // ignore — logo embed failure is non-fatal
    }
  }

  // Company name in header (Arabic above, English below) — centered
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'بيراميديا إكس لإدارة التسويق'), PAGE_W / 2, 10, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('pyramediaX for marketing managment', PAGE_W / 2, 18, { align: 'center' });
  doc.setFontSize(7);
  doc.text('Dubai, United Arab Emirates  |  hr@pyramedia.info', PAGE_W / 2, 25, { align: 'center' });

  let y = 36;

  // ─────────────────────────────────────────────
  // DOCUMENT TITLE
  // ─────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(12);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'نموذج تسليم عُهدة موظف'), PAGE_W / 2, y + 5, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Employee Asset Custody & Handover Form', PAGE_W / 2, y + 4, { align: 'center' });
  y += 8;

  // Gold underline below title
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN + 15, y, PAGE_W - MARGIN - 15, y);
  y += 6;

  // ─────────────────────────────────────────────
  // أولاً: بيانات الموظف
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'أولاً: بيانات الموظف', y);

  const place = data.handoverPlace ?? 'مكتب الشركة — دبي';
  y = drawFieldRow(doc, 'اسم الشركة', data.companyName || 'pyramediaX for marketing managment', y);
  y = drawFieldRow(doc, 'اسم الموظف', data.employeeName, y);
  y = drawFieldRow(doc, 'المسمى الوظيفي', data.jobTitle, y);
  y = drawFieldRow(doc, 'القسم / الإدارة', data.department, y);
  y = drawFieldRow(doc, 'رقم الهوية الإماراتية / جواز السفر', data.idNumber, y);
  y = drawFieldRow(doc, 'رقم الموظف', data.username, y);
  y = drawFieldRow(doc, 'تاريخ تسليم العهدة', data.handoverDate, y);
  y = drawFieldRow(doc, 'مكان التسليم', place, y);
  y += 3;

  // ─────────────────────────────────────────────
  // ثانياً: بيان العُهد المسلّمة للموظف (table)
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'ثانياً: بيان العُهد المسلّمة للموظف', y);
  y = ensureSpace(doc, y, 20);

  // Column widths (total = CONTENT_W)
  // م | نوع العهدة | الوصف/الموديل | الرقم التسلسلي/IMEI | الحالة | القيمة (درهم) | ملاحظات
  const colWidths = [8, 22, 38, 32, 24, 22, 36]; // sum = 182 = CONTENT_W (14*2 = 28, PAGE_W=210)
  // Adjust: CONTENT_W = 210 - 28 = 182
  const colHeaders = [
    'م',
    'نوع العهدة',
    'الوصف / الموديل',
    'الرقم التسلسلي / IMEI',
    'الحالة عند التسليم',
    'القيمة (درهم)',
    'ملاحظات / ملحقات',
  ];

  // Calculate column x positions (RTL: start from right)
  // Columns run right-to-left: col[0] (م) is rightmost
  const colX: number[] = [];
  let cx = PAGE_W - MARGIN;
  for (const w of colWidths) {
    colX.push(cx - w);
    cx -= w;
  }
  // colX[i] = left edge of column i; colX[i] + colWidths[i] = right edge

  const ROW_H = 8;

  // Table header
  doc.setFillColor(...TABLE_HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  for (let i = 0; i < colHeaders.length; i++) {
    const cx2 = colX[i] + colWidths[i] / 2;
    doc.text(prepareRtl(doc,colHeaders[i]), cx2, y + 5.5, { align: 'center' });
  }

  // Draw vertical dividers for header
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.3);
  for (let i = 1; i < colWidths.length; i++) {
    const lx = colX[i] + colWidths[i];
    doc.line(lx, y, lx, y + ROW_H);
  }

  y += ROW_H;

  // Asset rows — at least 2 rows even if empty
  const rowsToRender = data.assets.length > 0 ? data.assets : [{
    type: '', description: '', serial: '', condition: '', value: '', notes: '',
  }, {
    type: '', description: '', serial: '', condition: '', value: '', notes: '',
  }];

  rowsToRender.forEach((asset, idx) => {
    y = ensureSpace(doc, y, ROW_H);

    if (idx % 2 === 1) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');
    }

    // Outer border
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'S');

    // Vertical dividers
    for (let i = 1; i < colWidths.length; i++) {
      const lx = colX[i] + colWidths[i];
      doc.line(lx, y, lx, y + ROW_H);
    }

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);

    // Row data (RTL cols)
    const rowValues = [
      String(idx + 1),              // م
      asset.type,                   // نوع العهدة
      asset.description,            // الوصف/الموديل
      asset.serial,                 // الرقم التسلسلي
      asset.condition,              // الحالة
      asset.value,                  // القيمة
      asset.notes,                  // ملاحظات
    ];

    for (let i = 0; i < rowValues.length; i++) {
      const val = rowValues[i];
      if (val) {
        const cx2 = colX[i] + colWidths[i] / 2;
        const shaped = prepareRtl(doc,val);
        doc.text(shaped, cx2, y + 5.5, { align: 'center' });
      }
    }

    y += ROW_H;
  });

  y += 4;

  // ─────────────────────────────────────────────
  // ثالثاً: إقرار استلام العهدة
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'ثالثاً: إقرار استلام العهدة', y);
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'أقرّ أنا الموظف الموقّع أدناه بأنني استلمت من شركة pyramediaX for marketing managment جميع العُهد الموضحة أعلاه بحالتها المبينة في هذا النموذج، وأتعهد بأن تكون العهدة تحت مسؤوليتي الكاملة من تاريخ الاستلام وحتى تاريخ إعادتها للشركة أو تسليمها لمن تحدده الإدارة كتابةً.', {
    x: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W,
    lineHeight: 5.5,
    fontSize: 9,
  });
  y += 4;

  // ─────────────────────────────────────────────
  // رابعاً: التزامات الموظف تجاه العهدة
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'رابعاً: التزامات الموظف تجاه العهدة', y);
  const obligations = [
    'استخدام العهدة في أغراض العمل فقط وبما يخدم مصالح الشركة، وعدم استخدامها لأي أغراض شخصية أو تجارية خارج نطاق العمل إلا بموافقة الإدارة.',
    'المحافظة على العهدة وملحقاتها وكلمات المرور والحسابات والبيانات المرتبطة بها، وبذل عناية الشخص الحريص في استخدامها وحمايتها.',
    'عدم تسليم العهدة أو إعارتها أو تمكين أي شخص آخر من استخدامها دون موافقة كتابية مسبقة من الإدارة أو مسؤول الموارد البشرية.',
    'إبلاغ الإدارة ومسؤول الموارد البشرية فوراً عند حدوث فقدان أو سرقة أو تلف أو عطل أو اختراق أو اشتباه في إساءة استخدام العهدة أو البيانات المرتبطة بها.',
    'عدم تثبيت أو استخدام أي برامج أو تطبيقات أو أدوات غير مصرح بها، وعدم استخدام أجهزة أو خطوط الشركة في أي نشاط يخالف القانون أو الآداب أو سياسات الشركة.',
    'إعادة العهدة كاملة وبحالة سليمة مع جميع الملحقات والحسابات والملفات والبيانات فور طلب الشركة، أو عند انتهاء علاقة العمل، أو تغيير المنصب، أو انتهاء الحاجة التشغيلية للعهدة.',
    'عدم حذف أو إتلاف أو نقل أو نسخ بيانات الشركة أو العملاء أو الحسابات أو الملفات دون إذن كتابي، وتعتبر جميع هذه البيانات ملكاً خالصاً للشركة.',
  ];
  for (let i = 0; i < obligations.length; i++) {
    y = drawNumberedParagraph(doc, i + 1, obligations[i], y);
  }
  y += 4;

  // ─────────────────────────────────────────────
  // خامساً: المسؤولية عن التلف أو الفقدان أو سوء الاستخدام
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'خامساً: المسؤولية عن التلف أو الفقدان أو سوء الاستخدام', y);
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'في حال ثبوت تسبب الموظف، نتيجة الإهمال أو سوء الاستخدام أو مخالفة التعليمات أو التصرف غير المصرح به، في تلف أو فقدان أو إتلاف أي عهدة أو ملحقاتها أو بياناتها، يحق للشركة اتخاذ الإجراءات الإدارية والقانونية اللازمة، بما في ذلك التحقيق الداخلي الكتابي، وتقدير قيمة الضرر، ومطالبة الموظف بالتعويض أو إجراء الخصم المسموح به قانوناً من الأجر وفقاً لأحكام قانون العمل الإماراتي والقرارات التنفيذية ذات الصلة.', {
    x: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W,
    lineHeight: 5.5,
    fontSize: 9,
  });
  y += 3;
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'ولا يُعد توقيع الموظف على هذا النموذج مانعاً للشركة من اتخاذ أي إجراء قانوني أو إداري إضافي لحماية أموالها أو بياناتها أو حقوقها أو حقوق عملائها.', {
    x: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W,
    lineHeight: 5.5,
    fontSize: 9,
  });
  y += 4;

  // ─────────────────────────────────────────────
  // سادساً: السرية وحسابات الشركة
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'سادساً: السرية وحسابات الشركة', y);
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, 'يلتزم الموظف بالحفاظ التام على سرية جميع معلومات الشركة والعملاء والموردين والحملات والحسابات والملفات وكلمات المرور وأرقام الهواتف وقواعد البيانات وأي معلومات اطلع عليها بسبب عمله. كما يلتزم بتسليم جميع الحسابات الرقمية وبيانات الدخول وأي وسائل تحقق مرتبطة بالعهدة عند طلب الشركة، وعدم الاحتفاظ بأي نسخة منها بعد انتهاء علاقة العمل أو انتهاء الحاجة إليها.', {
    x: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W,
    lineHeight: 5.5,
    fontSize: 9,
  });
  y += 4;

  // ─────────────────────────────────────────────
  // سابعاً: المرجعية القانونية في دولة الإمارات
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'سابعاً: المرجعية القانونية في دولة الإمارات', y);
  const legalRefs = [
    'المادة (16) من قانون العمل الإماراتي رقم 33 لسنة 2021 بشأن تنظيم علاقات العمل: التزام العامل بالمحافظة على أدوات العمل والمواد الموضوعة تحت عهدته، وحفظ الأسرار المهنية، وإرجاع ما في عهدته عند انتهاء الخدمة.',
    'المادة (25): تنظيم الحالات التي يجوز فيها الخصم من أجر العامل، ومنها إصلاح الضرر الناتج عن خطأ العامل أو مخالفته لتعليمات صاحب العمل، وفق الحدود والإجراءات القانونية.',
    'المادة (44): حق صاحب العمل في إنهاء الخدمة دون إنذار في حالات محددة، ومنها إلحاق خسارة مادية جسيمة بصاحب العمل أو إفشاء أسرار العمل، بعد التحقيق الكتابي ووفق الضوابط القانونية.',
  ];
  for (let i = 0; i < legalRefs.length; i++) {
    y = drawNumberedParagraph(doc, i + 1, legalRefs[i], y);
  }
  y += 4;

  // ─────────────────────────────────────────────
  // ثامناً: إقرار إعادة العهدة / التسليم النهائي
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'ثامناً: إقرار إعادة العهدة / التسليم النهائي', y);
  y = ensureSpace(doc, y, 40);

  const returnFields = [
    'تاريخ إعادة العهدة: ../../20..',
    'حالة العهدة عند الإرجاع: سليمة / تالفة / ناقصة / مفقودة / أخرى: ......',
    'الملحقات المستلمة: كاملة / ناقصة — التفاصيل: ......',
    'الحسابات والبيانات: تم التسليم / لم يتم / لا ينطبق — التفاصيل: ......',
    'ملاحظات الموارد البشرية / الإدارة: ......',
  ];

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  for (const field of returnFields) {
    y = ensureSpace(doc, y, 8);
    doc.text(prepareRtl(doc,field), PAGE_W - MARGIN, y, { align: 'right' });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 7;
  }
  y += 4;

  // ─────────────────────────────────────────────
  // تاسعاً: التوقيعات والاعتماد
  // ─────────────────────────────────────────────
  y = drawSectionHeadingAr(doc, 'تاسعاً: التوقيعات والاعتماد', y);
  y = ensureSpace(doc, y, 50);

  // Signature table: 4 columns — الطرف | الاسم | التوقيع | التاريخ
  const sigColHeaders = ['الطرف', 'الاسم', 'التوقيع', 'التاريخ'];
  const sigColW = [50, 50, 50, 32]; // total = 182
  // RTL: rightmost col first (الطرف), then الاسم, التوقيع, التاريخ
  const sigColX: number[] = [];
  let scx = PAGE_W - MARGIN;
  for (const w of sigColW) {
    sigColX.push(scx - w);
    scx -= w;
  }

  const SIG_ROW_H = 10;

  // Header row
  doc.setFillColor(...TABLE_HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_W, SIG_ROW_H, 'F');
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  for (let i = 0; i < sigColHeaders.length; i++) {
    const cx2 = sigColX[i] + sigColW[i] / 2;
    doc.text(prepareRtl(doc,sigColHeaders[i]), cx2, y + 6.5, { align: 'center' });
  }
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.3);
  for (let i = 1; i < sigColW.length; i++) {
    const lx = sigColX[i] + sigColW[i];
    doc.line(lx, y, lx, y + SIG_ROW_H);
  }
  y += SIG_ROW_H;

  // Data rows
  const sigRows = [
    ['الموظف', '', '', '../../20..'],
    ['مسؤول الموارد البشرية', '', '', '../../20..'],
    ['المدير المباشر / الإدارة', '', '', '../../20..'],
  ];

  sigRows.forEach((row, idx) => {
    y = ensureSpace(doc, y, SIG_ROW_H);
    if (idx % 2 === 1) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(MARGIN, y, CONTENT_W, SIG_ROW_H, 'F');
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN, y, CONTENT_W, SIG_ROW_H, 'S');
    // Vertical dividers
    for (let i = 1; i < sigColW.length; i++) {
      const lx = sigColX[i] + sigColW[i];
      doc.line(lx, y, lx, y + SIG_ROW_H);
    }
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    for (let i = 0; i < row.length; i++) {
      if (row[i]) {
        const cx2 = sigColX[i] + sigColW[i] / 2;
        doc.text(prepareRtl(doc,row[i]), cx2, y + 6.5, { align: 'center' });
      }
    }
    y += SIG_ROW_H;
  });

  y += 5;

  // Stamp line
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(prepareRtl(doc,'ختم الشركة: ......'), PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  // ─────────────────────────────────────────────
  // ENGLISH APPENDIX
  // ─────────────────────────────────────────────
  // Add new page for English appendix
  doc.addPage();
  y = TOP_Y;

  // Appendix header
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('Employee Asset Custody Acknowledgement', PAGE_W / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9.5);
  doc.text(prepareRtl(doc,'ملحق مختصر باللغة الإنجليزية'), PAGE_W / 2, y, { align: 'center' });
  y += 6;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN + 20, y, PAGE_W - MARGIN - 20, y);
  y += 6;

  // English body
  const englishBody =
    'I acknowledge receiving the company assets listed in this form from pyramediaX for marketing managment. ' +
    'I undertake to use them only for business purposes, keep them safe, protect company/client data and accounts, ' +
    'and return all assets, accessories, files, passwords and related access immediately upon company request or ' +
    'upon termination of employment. I understand that I may be held responsible for any loss, damage, misuse, ' +
    'unauthorized transfer, data breach, or breach of company instructions, subject to UAE Labour Law and company procedures.';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  const enLines: string[] = doc.splitTextToSize(englishBody, CONTENT_W);
  for (const line of enLines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, MARGIN, y);
    y += 5.5;
  }
  y += 6;

  // Signature fields (English)
  const enSigFields = [
    `Employee Name / اسم الموظف: ${data.employeeName || '......'}`,
    'Signature / التوقيع: ......',
    'Date / التاريخ: ../../20..',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  for (const field of enSigFields) {
    y = ensureSpace(doc, y, 10);
    doc.text(field, MARGIN, y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
    y += 9;
  }

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

  return doc.output('blob');
}
