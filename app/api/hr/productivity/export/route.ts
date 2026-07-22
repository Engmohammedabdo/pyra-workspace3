import { NextRequest } from 'next/server';
import jsPDF from 'jspdf';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeProductivity,
  computeProductivityTrends,
  type ProductivityReport,
  type ProductivityTrends,
} from '@/lib/production/report';
import {
  buildProductivityWorkbook,
  productivityAttributionReviewReason,
  productivityMonthTasks,
  productivityTaskPdfLine,
} from '@/lib/production/productivity-export';
import { registerArabicFont } from '@/lib/pdf/pdf-fonts';
import { enableRtlPassthrough, prepareRtl } from '@/lib/pdf/arabic';
import { loadServerPdfFonts } from '@/lib/pdf/pdf-assets-server';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

export const runtime = 'nodejs';

type ExportFormat = 'pdf' | 'xlsx';

function metricValue(value: number | null): string | number {
  return value === null ? '-' : value;
}

function contentDisposition(fileName: string): string {
  return `attachment; filename="${fileName}"`;
}

function bufferBody(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function drawRtl(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
) {
  doc.setFont('Amiri', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 10);
  if (opts.color) doc.setTextColor(...opts.color);
  else doc.setTextColor(20, 20, 20);
  doc.text(prepareRtl(doc, text), x, y, { align: 'right' });
}

function ensurePage(doc: jsPDF, y: number, needed = 12): number {
  if (y + needed <= 282) return y;
  doc.addPage();
  return 18;
}

async function buildPdf(report: ProductivityReport, trends: ProductivityTrends): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerArabicFont(doc, await loadServerPdfFonts());
  enableRtlPassthrough(doc);

  let y = 18;
  drawRtl(doc, 'تقرير الإنتاجية الشهري', 195, y, { size: 18, bold: true, color: [249, 115, 22] }); // i18n-exempt: Arabic productivity PDF export content
  y += 8;
  drawRtl(doc, `الشهر: ${report.month}`, 195, y, { size: 11 }); // i18n-exempt: Arabic productivity PDF export content
  y += 10;

  drawRtl(doc, 'ملخص الموظفين', 195, y, { size: 13, bold: true }); // i18n-exempt: Arabic productivity PDF export content
  y += 7;
  for (const emp of report.employees) {
    y = ensurePage(doc, y, 18);
    drawRtl(doc, emp.display_name, 195, y, { size: 11, bold: true });
    y += 6;
    drawRtl(
      doc,
      `تسليمات: ${emp.metrics.deliveries} | التزام: ${metricValue(emp.metrics.on_time_pct)}% | تأخير: ${metricValue(emp.metrics.avg_delay_days)} يوم | جولات: ${metricValue(emp.metrics.avg_rounds)} | حضور: ${emp.attendance.present_days} | غياب: ${emp.attendance.absent_days}`, // i18n-exempt: Arabic productivity PDF export content
      195,
      y,
      { size: 9 },
    );
    y += 7;
  }

  y += 3;
  y = ensurePage(doc, y, 38);
  drawRtl(doc, 'اتجاه آخر 6 شهور', 195, y, { size: 13, bold: true }); // i18n-exempt: Arabic productivity PDF export content
  y += 7;
  for (const point of trends.months) {
    y = ensurePage(doc, y, 7);
    drawRtl(
      doc,
      `${point.month} | تسليمات ${point.deliveries} | التزام ${metricValue(point.on_time_pct)}% | جولات ${metricValue(point.avg_rounds)} | سرعة ${metricValue(point.avg_days_to_first_submission)} يوم`, // i18n-exempt: Arabic productivity PDF export content
      195,
      y,
      { size: 8.5 },
    );
    y += 6;
  }

  y += 4;
  y = ensurePage(doc, y, 18);
  drawRtl(doc, 'تفاصيل المهام', 195, y, { size: 13, bold: true }); // i18n-exempt: Arabic productivity PDF export content
  y += 7;
  for (const emp of report.employees) {
    const tasks = productivityMonthTasks(emp.tasks, report.month);
    if (!tasks.length) continue;
    y = ensurePage(doc, y, 10);
    drawRtl(doc, emp.display_name, 195, y, { size: 10, bold: true });
    y += 6;
    for (const task of tasks) {
      y = ensurePage(doc, y, 8);
      drawRtl(doc, productivityTaskPdfLine(task), 195, y, { size: 8 });
      y += 5.5;
    }
  }

  const reviewTasks = productivityMonthTasks(report.unattributed_tasks, report.month);
  if (reviewTasks.length) {
    y += 4;
    y = ensurePage(doc, y, 18);
    drawRtl(
      doc,
      'مهام تحتاج مراجعة الإسناد — منفصلة عن أرقام الموظفين', // i18n-exempt: Arabic productivity PDF export content
      195,
      y,
      { size: 13, bold: true, color: [180, 83, 9] },
    );
    y += 7;
    for (const task of reviewTasks) {
      y = ensurePage(doc, y, 8);
      drawRtl(
        doc,
        `${productivityTaskPdfLine(task)} | سبب المراجعة: ${productivityAttributionReviewReason(task)}`, // i18n-exempt: Arabic productivity PDF export content
        195,
        y,
        { size: 8 },
      );
      y += 5.5;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    drawRtl(doc, `صفحة ${page} من ${pageCount}`, 195, 290, { size: 8, color: [110, 110, 110] }); // i18n-exempt: Arabic productivity PDF export content
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// GET /api/hr/productivity/export?month=YYYY-MM&format=pdf|xlsx
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('hr.view');
    if (isApiError(auth)) return auth;

    const month = request.nextUrl.searchParams.get('month') || dubaiDayKey().slice(0, 7);
    const format = (request.nextUrl.searchParams.get('format') || 'xlsx') as ExportFormat;
    if (!/^\d{4}-\d{2}$/.test(month)) return apiValidationError('month must use YYYY-MM format');
    if (!['pdf', 'xlsx'].includes(format)) return apiValidationError('format must be pdf or xlsx');

    const supabase = createServiceRoleClient();
    const [report, trends] = await Promise.all([
      computeProductivity(supabase, month),
      computeProductivityTrends(supabase, 6),
    ]);

    if (format === 'pdf') {
      const body = await buildPdf(report, trends);
      return new Response(bufferBody(body), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': contentDisposition(`production-productivity-${month}.pdf`),
        },
      });
    }

    const body = buildProductivityWorkbook(report, trends);
    return new Response(bufferBody(body), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(`production-productivity-${month}.xlsx`),
      },
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'hr-productivity-export' } });
    console.error('[GET /api/hr/productivity/export] error:', err);
    return apiServerError();
  }
}
