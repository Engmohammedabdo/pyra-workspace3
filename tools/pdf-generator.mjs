#!/usr/bin/env node
/**
 * Arabic PDF Generator — Pyramedia
 * 
 * Generates professional Arabic PDFs using Puppeteer + Playwright Chromium.
 * Built-in templates: report, proposal, invoice, campaign-report
 * 
 * Usage:
 *   node pdf-generator.mjs generate --template report --data '{}' --output out.pdf
 *   node pdf-generator.mjs templates
 *   node pdf-generator.mjs demo --template report --output /tmp/demo-report.pdf
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ───
const CHROME_PATH = '/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const LD_LIB_PATH = '/home/node/.local/lib/chromium-deps';
const TEMPLATES_DIR = resolve(__dirname, 'pdf-templates');
const BRAND_COLOR = '#6C5CE7';
const BRAND_LIGHT = '#A29BFE';
const BRAND_BG = '#F8F7FF';

// ─── Base HTML wrapper ───
function wrapHTML(bodyContent, opts = {}) {
  const { title = 'Document', extraCSS = '' } = opts;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Cairo', sans-serif;
    direction: rtl;
    text-align: right;
    font-size: 14px;
    line-height: 1.7;
    color: #2D3436;
    background: #fff;
  }
  .page { padding: 40px 50px; }
  h1 { font-size: 28px; font-weight: 800; color: ${BRAND_COLOR}; margin-bottom: 8px; }
  h2 { font-size: 20px; font-weight: 700; color: ${BRAND_COLOR}; margin: 24px 0 10px; border-bottom: 2px solid ${BRAND_LIGHT}; padding-bottom: 6px; }
  h3 { font-size: 16px; font-weight: 700; color: #2D3436; margin: 16px 0 8px; }
  p { margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: ${BRAND_COLOR}; color: #fff; font-weight: 700; padding: 10px 14px; font-size: 13px; }
  td { padding: 9px 14px; border-bottom: 1px solid #DFE6E9; font-size: 13px; }
  tr:nth-child(even) td { background: ${BRAND_BG}; }
  .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${BRAND_COLOR}; padding-bottom: 16px; margin-bottom: 24px; }
  .header-bar .logo-area { display: flex; align-items: center; gap: 12px; }
  .header-bar .logo-placeholder { width: 50px; height: 50px; background: ${BRAND_COLOR}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 22px; }
  .header-bar .company-name { font-size: 24px; font-weight: 800; color: ${BRAND_COLOR}; }
  .meta-info { color: #636E72; font-size: 12px; }
  .meta-info span { display: inline-block; margin-left: 20px; }
  .summary-box { background: ${BRAND_BG}; border-right: 4px solid ${BRAND_COLOR}; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 16px 0; }
  .cover-page { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_LIGHT} 100%); color: #fff; page-break-after: always; }
  .cover-page h1 { color: #fff; font-size: 42px; margin-bottom: 16px; }
  .cover-page .subtitle { font-size: 20px; font-weight: 300; opacity: 0.9; }
  .cover-page .cover-meta { margin-top: 40px; font-size: 14px; opacity: 0.8; }
  .kpi-card { display: inline-block; width: 18%; text-align: center; background: ${BRAND_BG}; border-radius: 10px; padding: 16px 8px; margin: 6px 1%; border-top: 3px solid ${BRAND_COLOR}; }
  .kpi-card .kpi-value { font-size: 26px; font-weight: 800; color: ${BRAND_COLOR}; }
  .kpi-card .kpi-label { font-size: 11px; color: #636E72; margin-top: 4px; }
  .total-row td { font-weight: 800; background: ${BRAND_BG} !important; border-top: 2px solid ${BRAND_COLOR}; }
  .footer { text-align: center; color: #B2BEC3; font-size: 10px; margin-top: 30px; padding-top: 12px; border-top: 1px solid #DFE6E9; }
  .page-break { page-break-before: always; }
  .terms li { margin-bottom: 6px; }
  .contact-grid { display: flex; gap: 20px; flex-wrap: wrap; }
  .contact-item { background: ${BRAND_BG}; padding: 12px 18px; border-radius: 8px; flex: 1; min-width: 200px; }
  .contact-item .label { font-size: 11px; color: #636E72; }
  .contact-item .value { font-weight: 700; color: ${BRAND_COLOR}; }
  .section-content { margin-bottom: 8px; }
  ${extraCSS}
</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

// ─── Templates ───
const templates = {

  // ────────── REPORT ──────────
  report: {
    name: 'تقرير احترافي',
    description: 'تقرير عمل احترافي مع أقسام وجداول',
    generate(data) {
      const {
        companyName = 'Pyramedia',
        title = 'تقرير عمل',
        date = new Date().toLocaleDateString('ar-EG'),
        preparedBy = 'فريق العمل',
        sections = [],
        summary = '',
      } = data;

      let body = `<div class="page">
        <div class="header-bar">
          <div class="logo-area">
            <div class="logo-placeholder">P</div>
            <div class="company-name">${companyName}</div>
          </div>
          <div class="meta-info">
            <span>التاريخ: ${date}</span>
            <span>اعداد: ${preparedBy}</span>
          </div>
        </div>
        <h1>${title}</h1>`;

      for (const sec of sections) {
        body += `<h2>${sec.title}</h2>`;
        if (sec.content) body += `<p class="section-content">${sec.content}</p>`;
        if (sec.table) {
          body += '<table><thead><tr>';
          for (const h of sec.table.headers) body += `<th>${h}</th>`;
          body += '</tr></thead><tbody>';
          for (const row of sec.table.rows) {
            body += '<tr>';
            for (const cell of row) body += `<td>${cell}</td>`;
            body += '</tr>';
          }
          body += '</tbody></table>';
        }
      }

      if (summary) {
        body += `<h2>الخلاصة</h2><div class="summary-box"><p>${summary}</p></div>`;
      }

      body += `<div class="footer">${companyName} — جميع الحقوق محفوظة</div></div>`;
      return wrapHTML(body, { title });
    },
    demoData: {
      companyName: 'Pyramedia',
      title: 'تقرير الاداء الشهري — يناير 2026',
      date: '2026/01/31',
      preparedBy: 'قسم التسويق الرقمي',
      sections: [
        {
          title: 'ملخص تنفيذي',
          content: 'يستعرض هذا التقرير اداء الحملات الاعلانية خلال شهر يناير 2026. حققنا نموا ملحوظا في معدلات التحويل بنسبة 23% مقارنة بالشهر السابق، مع تحسن واضح في تكلفة الاكتساب.',
        },
        {
          title: 'المؤشرات الرئيسية',
          table: {
            headers: ['المؤشر', 'القيمة', 'التغير', 'الهدف'],
            rows: [
              ['الانطباعات', '1,250,000', '+15%', '1,000,000'],
              ['النقرات', '45,800', '+22%', '40,000'],
              ['معدل النقر CTR', '3.66%', '+0.4%', '3.5%'],
              ['التحويلات', '1,240', '+23%', '1,000'],
              ['تكلفة الاكتساب CPA', '42 درهم', '-12%', '48 درهم'],
            ],
          },
        },
        {
          title: 'تحليل القنوات',
          table: {
            headers: ['القناة', 'الميزانية', 'الايرادات', 'العائد ROAS'],
            rows: [
              ['Meta Ads', '25,000 درهم', '112,500 درهم', '4.5x'],
              ['Google Ads', '18,000 درهم', '63,000 درهم', '3.5x'],
              ['TikTok Ads', '7,000 درهم', '21,000 درهم', '3.0x'],
            ],
          },
        },
        {
          title: 'التوصيات',
          content: 'نوصي بزيادة ميزانية Meta Ads بنسبة 20% نظرا لارتفاع معدل العائد. كما نقترح اختبار حملات فيديو جديدة على TikTok لاستهداف الفئة العمرية 18-24.',
        },
      ],
      summary: 'حقق الشهر نتائج ممتازة تجاوزت الاهداف المحددة. الاستراتيجية الحالية فعالة ونوصي بالاستمرار مع تعديلات طفيفة على توزيع الميزانية.',
    },
  },

  // ────────── PROPOSAL ──────────
  proposal: {
    name: 'عرض سعر',
    description: 'عرض سعر احترافي للعملاء مع خدمات واسعار',
    generate(data) {
      const {
        companyName = 'Pyramedia',
        clientName = 'العميل',
        projectName = 'المشروع',
        date = new Date().toLocaleDateString('ar-EG'),
        aboutUs = '',
        services = [],
        pricing = [],
        totalPrice = '',
        terms = [],
        contact = {},
        validUntil = '',
      } = data;

      // Cover page
      let body = `
        <div class="cover-page">
          <div class="logo-placeholder" style="width:80px;height:80px;font-size:36px;margin-bottom:24px;">P</div>
          <h1>${projectName}</h1>
          <div class="subtitle">عرض سعر مقدم الى: ${clientName}</div>
          <div class="cover-meta">
            <div>${companyName}</div>
            <div>${date}</div>
          </div>
        </div>`;

      // About us
      body += `<div class="page">
        <div class="header-bar">
          <div class="logo-area">
            <div class="logo-placeholder">P</div>
            <div class="company-name">${companyName}</div>
          </div>
          <div class="meta-info"><span>${date}</span></div>
        </div>`;

      if (aboutUs) {
        body += `<h2>من نحن</h2><p class="section-content">${aboutUs}</p>`;
      }

      // Services
      if (services.length) {
        body += '<h2>الخدمات المقدمة</h2>';
        for (const svc of services) {
          body += `<h3>${svc.name}</h3><p class="section-content">${svc.description}</p>`;
          if (svc.features) {
            body += '<ul>';
            for (const f of svc.features) body += `<li>${f}</li>`;
            body += '</ul>';
          }
        }
      }

      // Pricing
      if (pricing.length) {
        body += `<h2>جدول الاسعار</h2><table><thead><tr>
          <th>البند</th><th>التفاصيل</th><th>السعر</th>
          </tr></thead><tbody>`;
        for (const item of pricing) {
          body += `<tr><td>${item.item}</td><td>${item.details || '—'}</td><td>${item.price}</td></tr>`;
        }
        if (totalPrice) {
          body += `<tr class="total-row"><td colspan="2">الاجمالي</td><td>${totalPrice}</td></tr>`;
        }
        body += '</tbody></table>';
      }

      // Terms
      if (terms.length) {
        body += '<h2>الشروط والاحكام</h2><ol class="terms">';
        for (const t of terms) body += `<li>${t}</li>`;
        body += '</ol>';
      }
      if (validUntil) {
        body += `<p style="margin-top:12px;color:${BRAND_COLOR};font-weight:700;">هذا العرض صالح حتى: ${validUntil}</p>`;
      }

      // Contact
      if (Object.keys(contact).length) {
        body += '<h2>تواصل معنا</h2><div class="contact-grid">';
        if (contact.phone) body += `<div class="contact-item"><div class="label">الهاتف</div><div class="value">${contact.phone}</div></div>`;
        if (contact.email) body += `<div class="contact-item"><div class="label">البريد</div><div class="value">${contact.email}</div></div>`;
        if (contact.website) body += `<div class="contact-item"><div class="label">الموقع</div><div class="value">${contact.website}</div></div>`;
        if (contact.address) body += `<div class="contact-item"><div class="label">العنوان</div><div class="value">${contact.address}</div></div>`;
        body += '</div>';
      }

      body += `<div class="footer">${companyName} — جميع الحقوق محفوظة</div></div>`;
      return wrapHTML(body, { title: `عرض سعر — ${projectName}` });
    },
    demoData: {
      companyName: 'Pyramedia',
      clientName: 'شركة الامارات للتطوير',
      projectName: 'ادارة حملات التسويق الرقمي',
      date: '2026/02/01',
      validUntil: '2026/03/01',
      aboutUs: 'Pyramedia وكالة تسويق رقمي متخصصة في السوق الاماراتي. نقدم حلولا متكاملة في التسويق الرقمي وادارة الحملات الاعلانية وتطوير المحتوى. فريقنا يضم خبراء متخصصين بخبرة تتجاوز 8 سنوات في السوق الخليجي.',
      services: [
        {
          name: 'ادارة حملات Meta Ads',
          description: 'ادارة وتحسين حملات الاعلانات على Facebook و Instagram بما يشمل:',
          features: ['اعداد الحملات والمجموعات الاعلانية', 'تصميم الاعلانات والمحتوى', 'تحسين الاداء بشكل مستمر', 'تقارير اسبوعية وشهرية مفصلة'],
        },
        {
          name: 'ادارة حملات Google Ads',
          description: 'حملات بحث واعلانات عرض محسنة للسوق المحلي:',
          features: ['بحث وتحليل الكلمات المفتاحية', 'اعداد حملات البحث والعرض', 'تحسين صفحات الهبوط', 'تتبع التحويلات والتحليلات'],
        },
        {
          name: 'ادارة المحتوى والسوشيال ميديا',
          description: 'انشاء وجدولة محتوى احترافي على جميع المنصات:',
          features: ['خطة محتوى شهرية', '20 منشور شهريا', 'تصميم احترافي لكل منشور', 'ادارة التعليقات والرسائل'],
        },
      ],
      pricing: [
        { item: 'ادارة حملات Meta Ads', details: 'شهريا — لا يشمل ميزانية الاعلان', price: '5,000 درهم' },
        { item: 'ادارة حملات Google Ads', details: 'شهريا — لا يشمل ميزانية الاعلان', price: '4,000 درهم' },
        { item: 'ادارة المحتوى', details: '20 منشور شهريا + تصميم', price: '6,000 درهم' },
        { item: 'تقارير وتحليلات', details: 'تقارير اسبوعية وشهرية', price: 'مشمول' },
      ],
      totalPrice: '15,000 درهم / شهريا',
      terms: [
        'مدة العقد 3 اشهر كحد ادنى.',
        'الدفع مقدما في بداية كل شهر.',
        'ميزانية الاعلانات غير مشمولة ويتم دفعها مباشرة للمنصات.',
        'يتم تقديم تقرير اداء شهري مفصل.',
        'يمكن الغاء العقد بعد المدة الاولى بإشعار مسبق 30 يوم.',
        'اي خدمات اضافية يتم الاتفاق على سعرها بشكل منفصل.',
      ],
      contact: {
        phone: '+971 50 123 4567',
        email: 'info@pyramedia.ae',
        website: 'www.pyramedia.ae',
        address: 'دبي — الامارات العربية المتحدة',
      },
    },
  },

  // ────────── INVOICE ──────────
  invoice: {
    name: 'فاتورة',
    description: 'فاتورة احترافية مع بنود وضريبة',
    generate(data) {
      const {
        companyName = 'Pyramedia',
        companyDetails = '',
        invoiceNumber = '001',
        date = new Date().toLocaleDateString('ar-EG'),
        dueDate = '',
        clientName = '',
        clientDetails = '',
        items = [],
        subtotal = '',
        taxRate = '5%',
        taxAmount = '',
        total = '',
        paymentTerms = '',
        notes = '',
      } = data;

      let body = `<div class="page">
        <div class="header-bar">
          <div class="logo-area">
            <div class="logo-placeholder">P</div>
            <div class="company-name">${companyName}</div>
          </div>
          <div style="text-align:left;">
            <div style="font-size:28px;font-weight:800;color:${BRAND_COLOR};">فاتورة</div>
            <div class="meta-info">رقم: ${invoiceNumber}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
          <div>
            <h3>من:</h3>
            <p style="font-weight:700;">${companyName}</p>
            ${companyDetails ? `<p class="meta-info">${companyDetails}</p>` : ''}
          </div>
          <div>
            <h3>الى:</h3>
            <p style="font-weight:700;">${clientName}</p>
            ${clientDetails ? `<p class="meta-info">${clientDetails}</p>` : ''}
          </div>
          <div>
            <div class="meta-info">
              <p>التاريخ: ${date}</p>
              ${dueDate ? `<p>تاريخ الاستحقاق: ${dueDate}</p>` : ''}
            </div>
          </div>
        </div>

        <table>
          <thead><tr>
            <th style="width:10%;">#</th>
            <th style="width:40%;">البند</th>
            <th style="width:15%;">الكمية</th>
            <th style="width:15%;">سعر الوحدة</th>
            <th style="width:20%;">المجموع</th>
          </tr></thead>
          <tbody>`;

      items.forEach((item, i) => {
        body += `<tr>
          <td>${i + 1}</td>
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>${item.unitPrice}</td>
          <td>${item.total}</td>
        </tr>`;
      });

      body += `</tbody></table>

        <div style="display:flex;justify-content:flex-start;margin-top:16px;">
          <table style="width:300px;">
            <tr><td>المجموع الفرعي</td><td style="font-weight:700;">${subtotal}</td></tr>
            <tr><td>الضريبة (${taxRate})</td><td style="font-weight:700;">${taxAmount}</td></tr>
            <tr class="total-row"><td>الاجمالي المستحق</td><td style="font-size:18px;">${total}</td></tr>
          </table>
        </div>`;

      if (paymentTerms) {
        body += `<div class="summary-box" style="margin-top:24px;"><h3>شروط الدفع</h3><p>${paymentTerms}</p></div>`;
      }
      if (notes) {
        body += `<p style="margin-top:16px;color:#636E72;font-size:12px;">${notes}</p>`;
      }

      body += `<div class="footer">${companyName} — شكرا لتعاملكم معنا</div></div>`;
      return wrapHTML(body, { title: `فاتورة ${invoiceNumber}` });
    },
    demoData: {
      companyName: 'Pyramedia',
      companyDetails: 'دبي، الامارات العربية المتحدة\nالرقم الضريبي: 100123456700003',
      invoiceNumber: 'INV-2026-0042',
      date: '2026/02/01',
      dueDate: '2026/02/15',
      clientName: 'شركة الخليج للتجارة',
      clientDetails: 'ابوظبي، الامارات العربية المتحدة',
      items: [
        { description: 'ادارة حملات Meta Ads — يناير 2026', quantity: '1', unitPrice: '5,000 درهم', total: '5,000 درهم' },
        { description: 'ادارة حملات Google Ads — يناير 2026', quantity: '1', unitPrice: '4,000 درهم', total: '4,000 درهم' },
        { description: 'ادارة المحتوى — 20 منشور', quantity: '1', unitPrice: '6,000 درهم', total: '6,000 درهم' },
        { description: 'تصوير فيديو احترافي', quantity: '2', unitPrice: '2,500 درهم', total: '5,000 درهم' },
      ],
      subtotal: '20,000 درهم',
      taxRate: '5%',
      taxAmount: '1,000 درهم',
      total: '21,000 درهم',
      paymentTerms: 'يرجى التحويل خلال 15 يوم عمل الى حساب الشركة البنكي. في حال التأخير يتم احتساب غرامة 2% شهريا.',
      notes: 'هذه الفاتورة صادرة الكترونيا ولا تحتاج الى توقيع.',
    },
  },

  // ────────── CAMPAIGN REPORT ──────────
  'campaign-report': {
    name: 'تقرير حملة تسويقية',
    description: 'تقرير اداء حملة تسويقية مع مؤشرات KPI وتوصيات',
    generate(data) {
      const {
        companyName = 'Pyramedia',
        campaignName = 'حملة تسويقية',
        platform = 'Meta Ads',
        period = '',
        date = new Date().toLocaleDateString('ar-EG'),
        preparedBy = 'فريق التسويق',
        objective = '',
        kpis = {},
        budgetBreakdown = [],
        adPerformance = [],
        recommendations = [],
        summary = '',
      } = data;

      let body = `<div class="page">
        <div class="header-bar">
          <div class="logo-area">
            <div class="logo-placeholder">P</div>
            <div class="company-name">${companyName}</div>
          </div>
          <div class="meta-info">
            <span>${date}</span>
            <span>اعداد: ${preparedBy}</span>
          </div>
        </div>

        <h1>تقرير اداء الحملة</h1>
        <h3 style="color:${BRAND_LIGHT};margin-bottom:20px;">${campaignName} — ${platform}</h3>`;

      if (period) body += `<p class="meta-info">الفترة: ${period}</p>`;
      if (objective) body += `<div class="summary-box"><strong>هدف الحملة:</strong> ${objective}</div>`;

      // KPI Cards
      if (Object.keys(kpis).length) {
        body += '<h2>المؤشرات الرئيسية</h2><div style="text-align:center;margin:16px 0;">';
        const kpiLabels = {
          impressions: 'الانطباعات',
          clicks: 'النقرات',
          ctr: 'معدل النقر',
          cpc: 'تكلفة النقرة',
          conversions: 'التحويلات',
          cpa: 'تكلفة التحويل',
          spend: 'الانفاق',
          revenue: 'الايرادات',
          roas: 'العائد ROAS',
        };
        for (const [key, val] of Object.entries(kpis)) {
          body += `<div class="kpi-card"><div class="kpi-value">${val}</div><div class="kpi-label">${kpiLabels[key] || key}</div></div>`;
        }
        body += '</div>';
      }

      // Budget breakdown
      if (budgetBreakdown.length) {
        body += `<h2>توزيع الميزانية</h2><table><thead><tr>
          <th>البند</th><th>المبلغ</th><th>النسبة</th>
          </tr></thead><tbody>`;
        for (const item of budgetBreakdown) {
          body += `<tr><td>${item.item}</td><td>${item.amount}</td><td>${item.percentage}</td></tr>`;
        }
        body += '</tbody></table>';
      }

      // Ad performance
      if (adPerformance.length) {
        body += `<h2>اداء الاعلانات</h2><table><thead><tr>
          <th>الاعلان</th><th>الانطباعات</th><th>النقرات</th><th>CTR</th><th>التحويلات</th><th>CPA</th>
          </tr></thead><tbody>`;
        for (const ad of adPerformance) {
          body += `<tr><td>${ad.name}</td><td>${ad.impressions}</td><td>${ad.clicks}</td><td>${ad.ctr}</td><td>${ad.conversions}</td><td>${ad.cpa}</td></tr>`;
        }
        body += '</tbody></table>';
      }

      // Recommendations
      if (recommendations.length) {
        body += '<h2>التوصيات</h2>';
        for (const rec of recommendations) {
          body += `<div class="summary-box" style="margin-bottom:10px;"><strong>${rec.title}:</strong> ${rec.description}</div>`;
        }
      }

      if (summary) {
        body += `<h2>الخلاصة</h2><div class="summary-box"><p>${summary}</p></div>`;
      }

      body += `<div class="footer">${companyName} — تقرير سري وموجه للعميل فقط</div></div>`;
      return wrapHTML(body, { title: `تقرير حملة — ${campaignName}` });
    },
    demoData: {
      companyName: 'Pyramedia',
      campaignName: 'حملة عروض الشتاء',
      platform: 'Meta Ads + Google Ads',
      period: '1 يناير — 31 يناير 2026',
      date: '2026/02/03',
      preparedBy: 'فريق الاداء الرقمي',
      objective: 'زيادة المبيعات عبر الموقع الالكتروني خلال فترة التخفيضات الشتوية مع تحقيق عائد ROAS لا يقل عن 4x.',
      kpis: {
        impressions: '2.1M',
        clicks: '68,500',
        ctr: '3.26%',
        conversions: '1,850',
        cpa: '38 AED',
        roas: '5.2x',
      },
      budgetBreakdown: [
        { item: 'Meta Ads — حملات تحويل', amount: '35,000 درهم', percentage: '50%' },
        { item: 'Google Search Ads', amount: '20,000 درهم', percentage: '29%' },
        { item: 'Google Display', amount: '8,000 درهم', percentage: '11%' },
        { item: 'ريتارغتنغ', amount: '7,000 درهم', percentage: '10%' },
      ],
      adPerformance: [
        { name: 'فيديو — عروض الشتاء', impressions: '850K', clicks: '28,000', ctr: '3.3%', conversions: '780', cpa: '35 AED' },
        { name: 'كاروسيل — منتجات مميزة', impressions: '620K', clicks: '19,500', ctr: '3.1%', conversions: '520', cpa: '40 AED' },
        { name: 'صورة — خصم 50%', impressions: '430K', clicks: '15,000', ctr: '3.5%', conversions: '350', cpa: '36 AED' },
        { name: 'Google Search — كلمات رئيسية', impressions: '200K', clicks: '6,000', ctr: '3.0%', conversions: '200', cpa: '42 AED' },
      ],
      recommendations: [
        { title: 'زيادة ميزانية الفيديو', description: 'اعلانات الفيديو حققت اعلى معدل تحويل واقل تكلفة. نوصي بزيادة حصتها الى 40% من اجمالي الميزانية.' },
        { title: 'تحسين حملات Google Search', description: 'اضافة كلمات مفتاحية سلبية لتقليل الانفاق غير المجدي وتحسين جودة النقرات.' },
        { title: 'تفعيل Lookalike Audiences', description: 'انشاء جماهير مشابهة من المشترين الحاليين لتوسيع قاعدة العملاء المحتملين.' },
      ],
      summary: 'حققت الحملة نتائج ممتازة تجاوزت الاهداف المحددة. العائد على الانفاق الاعلاني بلغ 5.2x متجاوزا الهدف المحدد 4x. نوصي بتكرار الاستراتيجية مع تعديلات على توزيع الميزانية بناء على الاداء.',
    },
  },
};

// ─── PDF Generation ───
async function getPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    return (await import('puppeteer')).default;
  }
}

export async function generatePDF(htmlContent, options = {}) {
  const {
    format = 'A4',
    margin = { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    landscape = false,
    printBackground = true,
  } = options;

  // Set LD_LIBRARY_PATH
  process.env.LD_LIBRARY_PATH = LD_LIB_PATH + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');

  const puppeteer = await getPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    // Wait extra for font loading
    await page.evaluate(() => document.fonts?.ready);
    
    const pdfBuffer = await page.pdf({
      format,
      margin,
      landscape,
      printBackground,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function generateFromTemplate(templateName, data = {}, options = {}) {
  // Check built-in templates
  const tmpl = templates[templateName];
  if (tmpl) {
    const html = tmpl.generate(data);
    return generatePDF(html, options);
  }

  // Check external template file
  const tmplPath = resolve(TEMPLATES_DIR, `${templateName}.mjs`);
  if (existsSync(tmplPath)) {
    const mod = await import(tmplPath);
    const html = mod.generate(data);
    return generatePDF(html, options);
  }

  throw new Error(`Template "${templateName}" not found. Available: ${listTemplates().map(t => t.id).join(', ')}`);
}

export function listTemplates() {
  return Object.entries(templates).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
  }));
}

export async function generateDemo(templateName, outputPath) {
  const tmpl = templates[templateName];
  if (!tmpl) throw new Error(`Template "${templateName}" not found.`);
  if (!tmpl.demoData) throw new Error(`No demo data for "${templateName}".`);
  
  const pdf = await generateFromTemplate(templateName, tmpl.demoData);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, pdf);
  return outputPath;
}

// ─── CLI ───
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  }

  if (!cmd || cmd === 'help') {
    console.log(`
Arabic PDF Generator — Pyramedia

Usage:
  node pdf-generator.mjs templates                           List available templates
  node pdf-generator.mjs demo --template <name> --output <path>   Generate demo PDF
  node pdf-generator.mjs generate --template <name> --data '<json>' --output <path>
  node pdf-generator.mjs generate --html <file.html> --output <path>
`);
    return;
  }

  if (cmd === 'templates') {
    console.log('\nAvailable Templates:\n');
    for (const t of listTemplates()) {
      console.log(`  ${t.id.padEnd(20)} ${t.name} — ${t.description}`);
    }
    console.log('');
    return;
  }

  if (cmd === 'demo') {
    const template = getArg('template');
    const output = getArg('output') || `/tmp/demo-${template}.pdf`;
    if (!template) { console.error('Error: --template required'); process.exit(1); }
    
    console.log(`Generating demo: ${template} -> ${output}`);
    const path = await generateDemo(template, output);
    console.log(`Done! PDF saved to: ${path}`);
    return;
  }

  if (cmd === 'generate') {
    const template = getArg('template');
    const htmlFile = getArg('html');
    const output = getArg('output') || '/tmp/output.pdf';
    const dataStr = getArg('data');

    if (template) {
      const data = dataStr ? JSON.parse(dataStr) : {};
      const pdf = await generateFromTemplate(template, data);
      await writeFile(output, pdf);
      console.log(`PDF saved to: ${output}`);
    } else if (htmlFile) {
      const html = await readFile(htmlFile, 'utf-8');
      const pdf = await generatePDF(html);
      await writeFile(output, pdf);
      console.log(`PDF saved to: ${output}`);
    } else {
      console.error('Error: --template or --html required');
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${cmd}. Run with 'help' for usage.`);
  process.exit(1);
}

// Run CLI if invoked directly
const isMainModule = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('/pdf-generator.mjs')
);
if (isMainModule) {
  main().catch(err => { console.error('Error:', err.message); process.exit(1); });
}
