// NOTE: intentionally NOT 'use client' — this is an isomorphic utility (plain
// async function, no React/JSX), used BOTH in the browser AND server-side via
// dynamic import. A 'use client' directive would make the server's `await import()`
// resolve to a client-reference proxy and break server generation.

import jsPDF from 'jspdf';
import { registerArabicFont } from './pdf-fonts';
import { prepareRtl, drawRtlParagraph } from './arabic';

// ============================================================
// NDA PDF — PyramediaX
// Bilingual (Arabic primary) 3-page Non-Disclosure Agreement.
// Content source: docs/onboarding-templates/nda-content-ar.md
// ============================================================

export interface NdaData {
  date: string;
  nameAr: string;
  idNumber: string;
  nationality: string;
  jobTitle: string;
  address?: string;
  companyName: string; // default 'PyramediaX for Marketing & AI Solution'
}

/* ── Design tokens ── */
const ORANGE: [number, number, number] = [249, 115, 22];
const GOLD: [number, number, number] = [201, 168, 76];
const DARK: [number, number, number] = [17, 17, 17];
const GRAY: [number, number, number] = [100, 100, 100];
const WHITE: [number, number, number] = [255, 255, 255];

const PAGE_W = 210;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_MARGIN = 275; // leave room for footer
const TOP_Y = 22;

/** Draw a right-aligned Arabic heading with a gold underline. Returns new y. */
function drawArticleHeading(doc: jsPDF, text: string, y: number): number {
  if (y + 14 > BOTTOM_MARGIN) { doc.addPage(); y = TOP_Y; }
  doc.setFontSize(10.5);
  doc.setFont('Amiri', 'bold');
  doc.setTextColor(...DARK);
  doc.text(prepareRtl(doc,text), PAGE_W - MARGIN, y, { align: 'right' });
  y += 4;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 6;
}

/** Draw a block of Arabic body text. Returns new y. */
function drawBody(doc: jsPDF, text: string, y: number): number {
  doc.setFont('Amiri', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  return drawRtlParagraph(doc, text, {
    x: PAGE_W - MARGIN,
    y,
    maxWidth: CONTENT_W,
    lineHeight: 5.5,
    fontSize: 9,
    bottomMargin: BOTTOM_MARGIN,
    pageTopY: TOP_Y,
  });
}

/** Stamp the footer on every page. Called once after all content is drawn. */
function stampFooters(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    // Footer rule
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 281, PAGE_W - MARGIN, 281);
    // LTR part
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text(
      `PyramediaX Marketing & Media Solution L.L.C. — Confidential`,
      MARGIN,
      285,
    );
    // Arabic RTL part + page number
    doc.setFont('Amiri', 'normal');
    doc.setFontSize(6.5);
    const arFooter = prepareRtl(doc,`وثيقة سرية — صفحة ${i} من ${total}`);
    doc.text(arFooter, PAGE_W - MARGIN, 285, { align: 'right' });
  }
}

export async function generateNdaPDF(
  data: NdaData,
  opts?: { fonts?: { regular: string; bold: string }; defaultLogo?: string },
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await registerArabicFont(doc, opts?.fonts);

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
      // logo embed failure is non-fatal — fall through to text header
    }
  }

  // Company name in header
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'بيراميديا إكس — للإدارة التسويقية'), PAGE_W / 2, 11, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(data.companyName || 'PyramediaX for Marketing & AI Solution L.L.C.', PAGE_W / 2, 19, { align: 'center' });
  doc.setFontSize(7);
  doc.text('Dubai, United Arab Emirates  |  hr@pyramedia.info', PAGE_W / 2, 26, { align: 'center' });

  let y = 37;

  // ─────────────────────────────────────────────
  // DOCUMENT TITLE (bilingual)
  // ─────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(11);
  doc.setFont('Amiri', 'bold');
  doc.text(prepareRtl(doc,'اتفاقية عدم إفشاء وحماية المعلومات السرية والملكية الفكرية وعدم الاستقطاب'), PAGE_W / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAY);
  doc.text('Employee Non-Disclosure, IP Assignment & Non-Solicitation Agreement (NDA)', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('PyramediaX for Marketing & AI Solution L.L.C. — PyramediaX', PAGE_W / 2, y, { align: 'center' });
  y += 6;

  // Gold underline below title
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.7);
  doc.line(MARGIN + 10, y, PAGE_W - MARGIN - 10, y);
  y += 6;

  // ─────────────────────────────────────────────
  // META TABLE (3 rows: تاريخ / مكان / موضوع)
  // ─────────────────────────────────────────────
  const metaRows: Array<[string, string]> = [
    ['تاريخ الاتفاقية', data.date || '[ ____ / ____ / ______ ] م'],
    ['مكان الاتفاقية', 'إمارة دبي، دولة الإمارات العربية المتحدة'],
    ['موضوع الاتفاقية', 'حماية المعلومات السرية وحقوق الملكية الفكرية الخاصة بالشركة وعملائها، وعدم الاستقطاب'],
  ];

  const rowH = 8;
  for (let idx = 0; idx < metaRows.length; idx++) {
    const [label, value] = metaRows[idx];
    if (idx % 2 === 0) {
      doc.setFillColor(253, 250, 243);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    }
    // Label (bold, right-aligned in left half)
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    doc.text(prepareRtl(doc,label), MARGIN + CONTENT_W * 0.38, y + 5.5, { align: 'right' });
    // Value (normal, right-aligned to page right)
    doc.setFont('Amiri', 'normal');
    doc.text(prepareRtl(doc,value), PAGE_W - MARGIN, y + 5.5, { align: 'right' });
    y += rowH;
  }
  y += 6;

  // ─────────────────────────────────────────────
  // PARTIES BLOCK
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'أطراف الاتفاقية', y);

  // Party one (fixed)
  const party1 =
    'أولاً: شركة بيراميديا إكس للإدارة التسويقية (PyramediaX Marketing managment)، ' +
    'والمعروفة تجارياً باسم PyramediaX، رخصة تجارية رقم [ 1584491 ]، ' +
    'وعنوانها: إمارة دبي، دولة الإمارات العربية المتحدة، ' +
    'ويمثلها السيد/ محمد السيد محمد عبده عبدالرحمن بصفته المدير العام، ' +
    'ويُشار إليها لاحقاً بـ «الطرف الأول» أو «الشركة».';
  y = drawBody(doc, party1, y);
  y += 3;

  // Party two (filled from data)
  const address = data.address || '[ ________ ]';
  const party2 =
    `ثانياً: السيد/السيدة: ${data.nameAr}، ` +
    `حامل/حاملة هوية/جواز رقم: ${data.idNumber}، ` +
    `الجنسية: ${data.nationality}، ` +
    `المسمى الوظيفي: ${data.jobTitle}، ` +
    `والعنوان: ${address}، ` +
    'ويُشار إليه/إليها لاحقاً بـ «الطرف الثاني» أو «الموظف».';
  y = drawBody(doc, party2, y);
  y += 3;

  // Preamble
  const preamble =
    'تمهيد: حيث إن الطرف الثاني يعمل — أو على وشك العمل — لدى الطرف الأول، ' +
    'وبحكم طبيعة عمله سيطّلع على معلومات سرية وأسرار تجارية وبيانات عملاء تخص الشركة وعملاءها؛ ' +
    'وحيث ترغب الشركة في حماية هذه المعلومات وحقوقها في الملكية الفكرية؛ ' +
    'فقد اتفق الطرفان، وهما بكامل الأهلية المعتبرة شرعاً وقانوناً، على البنود التالية. ' +
    'وتُعدّ هذه الاتفاقية مكمّلةً لعقد العمل المبرم بين الطرفين وجزءاً لا يتجزأ منه، ' +
    'وشرطاً أساسياً لقيام علاقة العمل واستمرارها.';
  y = drawBody(doc, preamble, y);
  y += 5;

  // ─────────────────────────────────────────────
  // ARTICLE 1 — التعريفات
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (1): التعريفات', y);
  const art1 =
    'حيثما وردت الكلمات والعبارات التالية في هذه الاتفاقية يكون لها المعنى المبيّن قرينها، ما لم يقتضِ سياق النص خلاف ذلك:\n' +
    '«الشركة»: الطرف الأول وكافة أقسامه وأنشطته وشركاته الشقيقة والتابعة، بما في ذلك وكالة التسويق ونشاط حلول الذكاء الاصطناعي.\n' +
    '«الموظف»: الطرف الثاني.\n' +
    '«المعلومات السرية»: كل معلومة أو بيان — مكتوب أو شفهي أو إلكتروني — تخص الشركة أو عملاءها أو شركاءها، يطّلع عليها الموظف بمناسبة عمله، على النحو المفصّل في المادة (2).\n' +
    '«الأسرار التجارية»: المعلومات السرية التي تستمد قيمتها التجارية من كونها غير معلومة للعموم، ومنها على وجه الخصوص الأوامر البرمجية (Prompts) والأكواد المصدرية ونماذج التدريب وقواعد بيانات العملاء واستراتيجيات التسعير وأنظمة الأتمتة.\n' +
    '«مخرجات العمل»: كل ما يبتكره الموظف أو يطّوره أو يساهم فيه بمناسبة عمله لدى الشركة، من أفكار وتصاميم وحملات وأكواد (Prompts / Workflows) ومخرجات أنظمة الذكاء الاصطناعي وأي عمل أو نتاج فكري آخر.\n' +
    '«البيانات الشخصية»: أي بيانات تتعلق بشخص طبيعي محدد أو قابل للتحديد، وفق قانون حماية البيانات الشخصية الإماراتي.\n' +
    '«الملكية الفكرية الموجودة مسبقاً»: ما يملكه الموظف من حقوق ملكية فكرية قبل التحاقه بالشركة، أو ما يطّوره بشكل مستقل تماماً خارج نطاق عمله ودون استخدام موارد الشركة أو معلوماتها السرية.';
  y = drawBody(doc, art1, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 2 — نطاق المعلومات السرية
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (2): نطاق المعلومات السرية', y);
  const art2 =
    'تشمل المعلومات السرية كافة المعلومات التقنية والتجارية والإبداعية الخاصة بالطرف الأول بكافة أقسامه، على سبيل المثال لا الحصر:\n' +
    '(أ) بيانات وعلاقات العملاء: بيانات العملاء الحاليين والمحتملين (Leads) كالأسماء والأرقام، قواعد بيانات العملاء، تفاصيل المشاريع، محادثات الواتساب، وبيانات الـ CRM.\n' +
    '(ب) التسويق الرقمي وإدارة الحملات: الاستراتيجيات التسويقية، الأفكار الإبداعية، تفاصيل الحسابات الإعلانية (Business Managers)، الميزانيات، نتائج الحملات (ROAS)، التصاميم، الفيديوهات، والنصوص الإعلانية.\n' +
    '(ج) تقنيات الذكاء الاصطناعي والأتمتة: أنظمة الأتمتة (Automation Workflows)، وكلاء الذكاء الاصطناعي (AI Agents)، الأوامر البرمجية (Prompts)، نماذج التدريب، والأكواد المصدرية.\n' +
    '(د) المعلومات التجارية والمالية: قوائم الأسعار، عروض التسعير، تفاصيل الخدمات، الاتفاقيات، الهوامش، والبيانات المالية للشركة.\n' +
    '(هـ) المعلومات التشغيلية والإدارية: إجراءات العمل الداخلية (SOPs)، بيانات الموردين والشركاء، الخطط، وبيانات الموظفين.\n' +
    '(و) معلومات الغير: أي معلومات سرية تخص عملاء الشركة أو شركاءها يلتزم الطرف الأول تجاهها بالسرية.';
  y = drawBody(doc, art2, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 3 — الاستثناءات
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (3): الاستثناءات', y);
  const art3 =
    'لا تُعدّ من المعلومات السرية المعلوماتُ التي يُثبت الموظف بمستند مكتوب أنها:\n' +
    '(أ) كانت متاحة للعموم وقت الإفصاح، أو أصبحت كذلك لاحقاً دون إخلال من جانب الموظف؛\n' +
    '(ب) كانت بحوزته بصفة مشروعة قبل الإفصاح ودون التزام بالسرية؛\n' +
    '(ج) تلقّاها بصفة مشروعة من الغير دون إخلال بأي التزام بالسرية؛\n' +
    '(د) طوّرها بشكل مستقل تماماً دون استخدام المعلومات السرية أو موارد الشركة.\n\n' +
    'وإذا طُلب من الموظف الإفصاح عن معلومات سرية بموجب قانون أو أمر قضائي أو من جهة مختصة، يلتزم بإخطار الشركة كتابياً وفوراً — ما لم يُحظر ذلك قانوناً — لتمكينها من اتخاذ ما يلزم، ويقتصر الإفصاح على القدر المطلوب قانوناً.';
  y = drawBody(doc, art3, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 4 — التزامات الموظف بشأن السرية
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (4): التزامات الموظف بشأن السرية', y);
  const art4 =
    'يلتزم الموظف بما يلي:\n' +
    '(أ) استخدام المعلومات السرية فقط لأغراض أداء مهامه الوظيفية لصالح الشركة، وعدم استخدامها لمصلحته الشخصية أو لمصلحة الغير.\n' +
    '(ب) عدم إفشاء أو نقل أو نشر المعلومات السرية لأي طرف داخل الشركة أو خارجها إلا لمن يحتاجها بحكم عمله (Need-to-Know) وبتفويض من الشركة.\n' +
    '(ج) عدم نسخ أو تصوير أو تخزين المعلومات السرية على أجهزة شخصية أو حسابات سحابية أو بريد شخصي دون إذن كتابي مسبق.\n' +
    '(د) اتخاذ كل الاحتياطات المعقولة لحماية المعلومات السرية من الوصول أو الاستخدام غير المصرّح به.\n' +
    '(هـ) إخطار الشركة فوراً عند علمه بأي إفشاء أو فقد أو وصول غير مصرّح به للمعلومات السرية.';
  y = drawBody(doc, art4, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 5 — الملكية الفكرية والتنازل عنها
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (5): الملكية الفكرية والتنازل عنها', y);
  const art5 =
    '1. يقرّ الموظف بأن جميع مخرجات العمل وحقوق الملكية الفكرية الناشئة بمناسبة عمله لدى الشركة — بما فيها الأفكار والتصاميم والحملات والأكواد والأوامر البرمجية (Prompts) ونماذج سير العمل ومخرجات أنظمة الذكاء الاصطناعي — تكون ملكاً خالصاً ومطلقاً للشركة منذ لحظة إنشائها.\n' +
    '2. يتنازل الموظف بموجب هذه الاتفاقية تنازلاً نهائياً غير قابل للرجوع عن كافة حقوقه في مخرجات العمل لصالح الشركة، ويلتزم بالتوقيع على أي مستندات لازمة لنقل أو تسجيل تلك الحقوق دون مقابل إضافي.\n' +
    '3. يتنازل الموظف — إلى الحد الذي يجيزه القانون — عن أي حقوق أدبية قد تنشأ له في مخرجات العمل.\n' +
    '4. لا تشمل هذه المادة الملكية الفكرية الموجودة مسبقاً للموظف، شريطة أن يكون قد أفصح عنها كتابياً مقدماً؛ وفي حال دمجها في أعمال الشركة، يمنح الموظف الشركة ترخيصاً دائماً وغير حصري لاستخدامها.\n' +
    '5. لا يحق للموظف استخدام أي من مخرجات العمل خارج نطاق عمله، أو الترخيص بها لأي طرف ثالث.';
  y = drawBody(doc, art5, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 6 — حماية البيانات الشخصية
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (6): حماية البيانات الشخصية', y);
  const art6 =
    '1. يلتزم الموظف بالامتثال لقانون حماية البيانات الشخصية الإماراتي (المرسوم بقانون اتحادي رقم 45 لسنة 2021) ولوائحه التنفيذية، ولسياسات الشركة وعملائها بشأن حماية البيانات.\n' +
    '2. يعالج الموظف البيانات الشخصية الخاصة بعملاء الشركة وجهات الاتصال بناءً على تعليمات الشركة فقط وبالقدر اللازم لأداء عمله، ويُحظر نقلها أو تصديرها أو استخدامها لأي غرض شخصي أو تسويقي خارج نطاق الشركة.\n' +
    '3. يلتزم الموظف بإخطار الشركة فوراً بأي خرق أو تسريب فعلي أو محتمل للبيانات الشخصية.\n' +
    '4. تستمر هذه الالتزامات بعد انتهاء علاقة العمل.';
  y = drawBody(doc, art6, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 7 — الوصول التقني والأمان
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (7): الوصول التقني والأمان', y);
  const art7 =
    'يلتزم الموظف بالحفاظ على سرية بيانات الدخول وكلمات المرور وصلاحيات الحسابات الإعلانية (Business Managers) ومفاتيح واجهات البرمجة (API Keys) وأي بيانات وصول تخص أنظمة الشركة أو عملائها، وعدم نسخها أو مشاركتها أو استخدامها بعد انتهاء صلاحيته، ويلتزم بتسليمها أو إلغائها فور انتهاء العلاقة أو عند الطلب.';
  y = drawBody(doc, art7, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 8 — عدم الاستقطاب
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (8): عدم الاستقطاب', y);
  const art8 =
    'خلال مدة عمله، ولمدة [ 24 ] شهراً من تاريخ انتهاء علاقة العمل لأي سبب، يلتزم الموظف بألا يقوم — بشكل مباشر أو غير مباشر — بما يلي:\n' +
    '(أ) استقطاب أو محاولة استقطاب أي من عملاء الشركة الحاليين، أو الذين تعاملت معهم الشركة خلال آخر اثني عشر شهراً، بغرض تقديم خدمات منافسة لهم؛\n' +
    '(ب) استقطاب أو التحريض على ترك العمل لأي من موظفي الشركة أو المتعاقدين معها.';
  y = drawBody(doc, art8, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 9 — النشر على وسائل التواصل ودراسات الحالة وعدم الإساءة
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (9): النشر على وسائل التواصل ودراسات الحالة وعدم الإساءة', y);
  const art9 =
    'يُحظر على الموظف نشرُ أو عرضُ أي مخرجات أو نتائج حملات أو دراسات حالة (Case Studies) تخص الشركة أو عملاءها — على وسائل التواصل الاجتماعي أو في معرض الأعمال (Portfolio) أو السير الذاتية — دون إذن كتابي مسبق من الشركة. كما يلتزم بعدم الإساءة إلى سمعة الشركة أو عملائها بأي وسيلة.';
  y = drawBody(doc, art9, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 10 — إعادة المواد وإتلافها
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (10): إعادة المواد وإتلافها', y);
  const art10 =
    'عند انتهاء علاقة العمل أو عند طلب الشركة، يلتزم الموظف خلال [ 5 ] أيام بما يلي:\n' +
    '(أ) إعادة كافة الأجهزة والملفات والمستندات وبيانات الوصول العائدة للشركة؛\n' +
    '(ب) حذف أي نسخ إلكترونية من المعلومات السرية بحوزته حذفاً نهائياً؛\n' +
    '(ج) تقديم إقرار كتابي بإتمام الإعادة والحذف عند طلب الشركة.';
  y = drawBody(doc, art10, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 11 — مدة الاتفاقية واستمرارية الالتزامات
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (11): مدة الاتفاقية واستمرارية الالتزامات', y);
  const art11 =
    '1. تسري التزامات السرية خلال كامل مدة علاقة العمل، وتستمر لمدة سنتين (2) بعد انتهائها لأي سبب.\n' +
    '2. تظل الأسرار التجارية محميةً إلى ما لا نهاية طالما ظلّت محتفظةً بصفتها السرية.\n' +
    '3. يظل التنازل عن الملكية الفكرية (المادة 5) والتزامات حماية البيانات (المادة 6) سارَيين بصفة دائمة.';
  y = drawBody(doc, art11, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 12 — الجزاءات والتعويض الاتفاقي والإجراءات التحفظية
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (12): الجزاءات والتعويض الاتفاقي والإجراءات التحفظية', y);
  const art12 =
    '1. يقرّ الطرفان بأن إخلال الموظف بالتزامات السرية أو الملكية الفكرية قد يُلحق بالشركة أضراراً يصعب حصرها، ولا يكفي التعويض النقدي وحده لجبرها؛ وعليه يحق للشركة اللجوء إلى القضاء لطلب أوامر تحفظية أو وقتية لوقف المخالفة، فضلاً عن التعويض.\n' +
    '2. في حال ثبوت إخلال الموظف، يلتزم بأداء تعويض اتفاقي (شرط جزائي) لا يقل عن [ 100,000 ] درهم إماراتي، كحد أدنى يمثل تقديراً مبدئياً متفقاً عليه للضرر، ودون إخلال بحق الشركة في المطالبة بالتعويض الفعلي الكامل إذا جاوز هذا المبلغ.\n' +
    '3. يخضع تقدير التعويض لأحكام قانون المعاملات المدنية الإماراتي، بما في ذلك سلطة المحكمة المختصة في تعديل التعويض المتفق عليه ليطابق الضرر الفعلي.';
  y = drawBody(doc, art12, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 13 — العلاقة بعقد العمل وعدم المنافسة
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (13): العلاقة بعقد العمل وعدم المنافسة', y);
  const art13 =
    '1. لا تُخلّ هذه الاتفاقية بأحكام عقد العمل المبرم بين الطرفين، وفي حال التعارض يُؤخذ بالأحكام الأكثر حمايةً للمعلومات السرية وحقوق الشركة بما لا يخالف قانون العمل.\n' +
    '2. لا تمثل هذه الاتفاقية التزاماً من الشركة بالتعيين أو باستمرار التوظيف.\n' +
    '3. أي شرط لعدم المنافسة (Non-Compete) يخضع للمادة (10) من المرسوم بقانون اتحادي رقم 33 لسنة 2021، ويجب النص عليه في عقد العمل ذاته محدداً من حيث المدة (بما لا يجاوز سنتين) والنطاق الجغرافي ونوع العمل؛ ولا يُكتفى بإدراجه في هذه الاتفاقية الملحقة.';
  y = drawBody(doc, art13, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 14 — أحكام عامة
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (14): أحكام عامة', y);
  const art14 =
    '(أ) قابلية الفصل: إذا قُضي ببطلان أو عدم نفاذ أي بند من بنود هذه الاتفاقية، يظل باقي البنود صحيحاً ونافذاً، ويُستبدل البند المحكوم ببطلانه بما يقرب من قصد الطرفين في الحدود التي يجيزها القانون.\n' +
    '(ب) عدم التنازل: عدم ممارسة الشركة لأي حق من حقوقها لا يُعّد تنازلاً عنه.\n' +
    '(ج) كامل الاتفاق: تمثل هذه الاتفاقية كامل التفاهم بين الطرفين بشأن موضوعها فيما يتعلق بالسرية والملكية الفكرية، وتلغي ما سبقها من تفاهمات في هذا الخصوص.\n' +
    '(د) التعديل: لا يكون أي تعديل على هذه الاتفاقية نافذاً إلا إذا تمّ كتابةً وبتوقيع الطرفين.\n' +
    '(هـ) التنازل عن الاتفاقية: يحق للشركة التنازل عن حقوقها بموجب هذه الاتفاقية لأي خلف قانوني أو شركة تابعة دون حاجة لموافقة الموظف.\n' +
    '(و) المراسلات: تُوجّه المراسلات على العناوين المبيّنة في صدر الاتفاقية، أو على البريد الرسمي info@pyramedia.info.\n' +
    '(ز) لغة الاتفاقية: حُرّرت هذه الاتفاقية باللغة العربية، وهي اللغة المعتمدة والمرجّحة عند أي تفسير، وفي حال وجود ترجمة لأي لغة أخرى يُعتّد بالنص العربي.';
  y = drawBody(doc, art14, y);
  y += 4;

  // ─────────────────────────────────────────────
  // ARTICLE 15 — القانون الواجب التطبيق والاختصاص القضائي
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'المادة (15): القانون الواجب التطبيق والاختصاص القضائي', y);
  const art15 =
    'تخضع هذه الاتفاقية وتُفسَّر وفقاً لقوانين دولة الإمارات العربية المتحدة المعمول بها في إمارة دبي، وتختص محاكم دبي حصراً بالنظر في أي نزاع ينشأ عنها أو يتعلق بها.';
  y = drawBody(doc, art15, y);
  y += 6;

  // ─────────────────────────────────────────────
  // إقرار الموظف
  // ─────────────────────────────────────────────
  y = drawArticleHeading(doc, 'إقرار الموظف', y);
  const acknowledgement =
    'يقرّ الطرف الثاني بأنه قرأ هذه الاتفاقية وفهم كامل بنودها، وأُتيحت له فرصة الاستعانة بمستشار قانوني، وأنه يوقّعها بكامل إرادته الحرة ودون أي إكراه، وأنه تسلّم نسخةً منها.';
  y = drawBody(doc, acknowledgement, y);
  y += 6;

  // ─────────────────────────────────────────────
  // SIGNATURE BLOCK
  // ─────────────────────────────────────────────
  // Ensure there's enough space for the signatures (≈55mm) — if not, new page
  if (y + 55 > BOTTOM_MARGIN) {
    doc.addPage();
    y = TOP_Y;
  }

  // Gold rule above signatures
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  // Signatures heading
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(prepareRtl(doc,'التوقيعات'), PAGE_W / 2, y, { align: 'center' });
  y += 8;

  // Two-column signature boxes
  const sigColW = (CONTENT_W - 6) / 2;
  const sigH = 44;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  // Left box = Party Two (الموظف) — page right in RTL reading, but we draw left-to-right
  doc.rect(MARGIN, y, sigColW, sigH, 'S');
  // Right box = Party One (الشركة)
  doc.rect(MARGIN + sigColW + 6, y, sigColW, sigH, 'S');

  // Box labels
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  // Left box label
  doc.text(prepareRtl(doc,'الطرف الثاني (الموظف)'), MARGIN + sigColW / 2, y + 7, { align: 'center' });
  // Right box label
  doc.text(prepareRtl(doc,'الطرف الأول (الشركة)'), MARGIN + sigColW + 6 + sigColW / 2, y + 7, { align: 'center' });

  doc.setFont('Amiri', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);

  // Left box — employee details
  const empDetails = [
    `الاسم: ${data.nameAr}`,
    `الهوية / الجواز: ${data.idNumber}`,
    `المسمى الوظيفي: ${data.jobTitle}`,
  ];
  let ey = y + 14;
  for (const line of empDetails) {
    doc.text(prepareRtl(doc,line), MARGIN + sigColW - 3, ey, { align: 'right' });
    ey += 5.5;
  }
  // Signature line
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 3, y + sigH - 12, MARGIN + sigColW - 3, y + sigH - 12);
  doc.text(prepareRtl(doc,'التوقيع'), MARGIN + sigColW - 3, y + sigH - 7, { align: 'right' });
  doc.text(prepareRtl(doc,'التاريخ: ___/___/______'), MARGIN + sigColW - 3, y + sigH - 2, { align: 'right' });

  // Right box — company details
  const compDetails = [
    'الاسم: PyramediaX for Marketing & AI Solution',
    'الممثل: محمد السيد محمد عبده عبدالرحمن',
    'الصفة: المدير العام',
  ];
  let cy = y + 14;
  for (const line of compDetails) {
    doc.text(prepareRtl(doc,line), PAGE_W - MARGIN - 3, cy, { align: 'right' });
    cy += 5.5;
  }
  // Signature line
  doc.line(MARGIN + sigColW + 9, y + sigH - 12, PAGE_W - MARGIN - 3, y + sigH - 12);
  doc.text(prepareRtl(doc,'التوقيع'), PAGE_W - MARGIN - 3, y + sigH - 7, { align: 'right' });
  doc.text(prepareRtl(doc,'التاريخ: ___/___/______'), PAGE_W - MARGIN - 3, y + sigH - 2, { align: 'right' });

  // ─────────────────────────────────────────────
  // FOOTER PASS — stamp every page
  // ─────────────────────────────────────────────
  stampFooters(doc);

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  y; // suppress 'assigned but never read' TS warning

  return doc.output('blob');
}
