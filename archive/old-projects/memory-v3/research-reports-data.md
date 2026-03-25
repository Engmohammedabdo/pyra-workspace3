# بحث: تقارير PDF + تحليل بيانات

> تاريخ البحث: 2026-02-21
> البيئة: Node.js v22, Docker Linux x64, npm only

---

## التوصية النهائية

| الفئة | الأداة الموصى بها | السبب |
|-------|-------------------|-------|
| **PDF Generation** | **PDFKit** (0.17.2) | خفيف، بدون dependencies خارجية، API برمجي ممتاز |
| **DOCX Generation** | **docx** (9.5.3) | الأفضل لـ DOCX — declarative API، يدعم RTL أصلاً |
| **Excel Read/Write** | **ExcelJS** (4.4.0) | قراءة وكتابة Excel كاملة، streaming support |
| **CSV Processing** | **csv-parse** (6.1.0) | خفيف وسريع، sync و async |
| **Data Analysis** | **Arquero** (8.0.3) | DataFrame مثل pandas، بدون dependencies ثقيلة |
| **Presentations** | **PptxGenJS** (4.0.1) | الأفضل لـ PPTX — API حديث ونشيط |

---

## التفاصيل

### PDF / Document Generation

| الأداة | الإصدار | RTL Support | External Dependencies | npm install | التقييم |
|--------|---------|-------------|----------------------|-------------|---------|
| **PDFKit** | 0.17.2 | ⚠️ يحتاج خط عربي + manual handling | ❌ لا يحتاج | ✅ نظيف | ⭐⭐⭐⭐⭐ |
| **jsPDF** | 4.2.0 | ⚠️ يحتاج plugin + خط عربي | ❌ لا يحتاج | ✅ نظيف | ⭐⭐⭐⭐ |
| **docx** | 9.5.3 | ✅ يدعم RTL أصلاً (`bidirectional`) | ❌ لا يحتاج | ✅ نظيف | ⭐⭐⭐⭐⭐ |
| **Carbone** | 3.5.6 | ✅ عبر القوالب | ⚠️ يحتاج **LibreOffice** للـ PDF | ✅ نظيف | ⭐⭐⭐ (بسبب LibreOffice) |
| **pdfmake** | 0.3.4 | ⚠️ يحتاج خط عربي | ❌ لا يحتاج | ✅ نظيف | ⭐⭐⭐⭐ |

#### ملاحظات:
- **PDFKit**: الأخف والأقوى لـ PDF برمجياً. العربية تحتاج تحميل خط عربي (مثل Amiri/Cairo) واستخدام مكتبة `bidi` لترتيب النص.
- **docx**: الأفضل لـ DOCX — يدعم `BiDirectional` مباشرة في الـ API.
- **Carbone**: قوي جداً (template-based) لكن يحتاج LibreOffice مثبت وغير متاح في بيئتنا.
- **jsPDF**: مصمم أصلاً للمتصفح لكن يشتغل على Node.js. العربية تحتاج خط مخصص.

#### أمثلة كود:

**PDFKit — توليد PDF:**
```javascript
import PDFDocument from 'pdfkit';
import fs from 'fs';

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('report.pdf'));

// تحميل خط عربي (مثال: Amiri)
// doc.font('path/to/Amiri-Regular.ttf');

doc.fontSize(20).text('Report Title', { align: 'center' });
doc.moveDown();
doc.fontSize(12).text('Content here...');
doc.end();
```

**docx — توليد DOCX مع RTL:**
```javascript
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import fs from 'fs';

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        children: [
          new TextRun({ text: 'تقرير باللغة العربية', bold: true, size: 28, rightToLeft: true })
        ]
      })
    ]
  }]
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('report.docx', buffer);
```

---

### Data Analysis

| الأداة | الإصدار | Node.js v22 | Dependencies | الاستخدام | التقييم |
|--------|---------|-------------|--------------|-----------|---------|
| **ExcelJS** | 4.4.0 | ✅ يشتغل | خفيفة | قراءة/كتابة Excel | ⭐⭐⭐⭐⭐ |
| **xlsx (SheetJS)** | 0.18.5 | ✅ يشتغل | بدون | قراءة/كتابة Excel | ⭐⭐⭐⭐ |
| **csv-parse** | 6.1.0 | ✅ يشتغل | بدون | CSV parsing | ⭐⭐⭐⭐⭐ |
| **Arquero** | 8.0.3 | ✅ يشتغل | بدون | Data analysis (DataFrame) | ⭐⭐⭐⭐⭐ |
| **danfojs-node** | 1.2.0 | ✅ يشتغل | ⚠️ ثقيلة (TensorFlow!) | DataFrame مثل pandas | ⭐⭐⭐ |

#### ملاحظات:
- **ExcelJS** vs **xlsx**: كلاهما ممتاز. ExcelJS أحدث وله streaming. xlsx أخف وأبسط.
- **Arquero**: ⭐ التوصية الأولى لتحليل البيانات — خفيف، API شبيه بـ pandas/dplyr، بدون dependencies ثقيلة.
- **danfojs-node**: يشتغل لكن يسحب **TensorFlow.js** كـ dependency (ثقيل جداً ~200MB). غير عملي.

#### أمثلة كود:

**ExcelJS — قراءة Excel:**
```javascript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('data.xlsx');
const sheet = workbook.getWorksheet(1);

sheet.eachRow((row, rowNumber) => {
  console.log(`Row ${rowNumber}:`, row.values);
});
```

**csv-parse — قراءة CSV:**
```javascript
import { parse } from 'csv-parse/sync';
import fs from 'fs';

const content = fs.readFileSync('data.csv', 'utf-8');
const records = parse(content, { columns: true, skip_empty_lines: true });
console.log(records); // [{name: 'Ali', score: '95'}, ...]
```

**Arquero — تحليل بيانات:**
```javascript
import * as aq from 'arquero';

// من مصفوفة
const dt = aq.table({ name: ['Ali','Sara','Omar'], score: [95, 88, 92] });

// تصفية
dt.filter(d => d.score > 90).print();

// تجميع
dt.rollup({ avg: d => aq.op.mean(d.score), max: d => aq.op.max(d.score) }).print();

// من CSV
// const dt2 = aq.loadCSV('data.csv');
```

---

### Presentations (PPTX)

| الأداة | الإصدار | Node.js v22 | RTL | التقييم |
|--------|---------|-------------|-----|---------|
| **PptxGenJS** | 4.0.1 | ✅ يشتغل | ✅ `rtlMode: true` | ⭐⭐⭐⭐⭐ |
| **officegen** | 0.6.5 | ✅ يشتغل | ⚠️ محدود | ⭐⭐⭐ |

#### ملاحظات:
- **PptxGenJS**: الخيار الأفضل — API حديث، يدعم RTL، charts، images، tables.
- **officegen**: يشتغل لكن قديم (آخر تحديث 2021)، API أقل مرونة.

#### مثال كود:

**PptxGenJS — عرض تقديمي:**
```javascript
import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'A4', width: 10, height: 7.5 });

const slide = pptx.addSlide();
slide.addText('عنوان العرض', {
  x: 1, y: 1, w: 8, h: 1.5,
  fontSize: 36, bold: true, color: '363636',
  align: 'right', rtlMode: true
});

slide.addTable(
  [['الاسم', 'النتيجة'], ['علي', '95'], ['سارة', '88']],
  { x: 1, y: 3, w: 8, fontSize: 14 }
);

await pptx.writeFile({ fileName: 'presentation.pptx' });
```

---

## ملخص: الـ Stack الموصى به

```
PDF Reports:    pdfkit (0.17.2)     — npm install pdfkit
DOCX Reports:   docx (9.5.3)       — npm install docx
Excel I/O:      exceljs (4.4.0)    — npm install exceljs
CSV Parsing:    csv-parse (6.1.0)  — npm install csv-parse
Data Analysis:  arquero (8.0.3)    — npm install arquero
Presentations:  pptxgenjs (4.0.1)  — npm install pptxgenjs
```

### تثبيت الكل:
```bash
npm install pdfkit docx exceljs csv-parse arquero pptxgenjs
```

> ✅ كل الحلول أعلاه تم اختبارها فعلياً على Node.js v22 في بيئة Docker.
> ✅ لا تحتاج dependencies خارجية (لا Chrome، لا LibreOffice).
> ✅ تنزل بـ `npm install` بدون compilation أو native modules.

---

## ملاحظة عن العربية (RTL)

لدعم العربية في PDF:
1. **حمّل خط عربي** مثل [Amiri](https://github.com/aliftype/amiri) أو [Cairo](https://fonts.google.com/specimen/Cairo)
2. **سجّل الخط** في PDFKit: `doc.font('path/to/Amiri-Regular.ttf')`
3. **للنص ثنائي الاتجاه**: استخدم مكتبة `bidi` لترتيب الحروف

في **docx**: RTL مدعوم أصلاً عبر `bidirectional: true` و `rightToLeft: true`.
في **PptxGenJS**: RTL مدعوم عبر `rtlMode: true`.
