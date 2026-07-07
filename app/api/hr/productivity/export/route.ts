import { NextRequest } from 'next/server';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeProductivity,
  computeProductivityTrends,
  type EmployeeReport,
  type ProductivityReport,
  type ProductivityTrends,
} from '@/lib/production/report';
import type { TaskJourney } from '@/lib/production/metrics';
import { registerArabicFont } from '@/lib/pdf/pdf-fonts';
import { enableRtlPassthrough, prepareRtl } from '@/lib/pdf/arabic';
import { loadServerPdfFonts } from '@/lib/pdf/pdf-assets-server';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

export const runtime = 'nodejs';

type ExportFormat = 'pdf' | 'xlsx';

function monthOf(iso: string): string {
  return dubaiDayKey(new Date(iso)).slice(0, 7);
}

function monthTasks(emp: EmployeeReport, month: string): TaskJourney[] {
  const isCurrentMonth = month === dubaiDayKey().slice(0, 7);
  return emp.tasks.filter((task) => {
    if (task.delivered_at && monthOf(task.delivered_at) === month) return true;
    if (task.first_submitted_at && monthOf(task.first_submitted_at) === month) return true;
    if (isCurrentMonth && !task.first_submitted_at && !task.delivered_at && !task.is_archived) return true;
    return false;
  });
}

function metricValue(value: number | null): string | number {
  return value === null ? '-' : value;
}

function contentDisposition(fileName: string): string {
  return `attachment; filename="${fileName}"`;
}

function bufferBody(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function buildWorkbook(report: ProductivityReport, trends: ProductivityTrends): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryRows = report.employees.map((emp) => ({
    'الموظف': emp.display_name,
    'اسم المستخدم': emp.username,
    'التسليمات': emp.metrics.deliveries,
    'الالتزام %': metricValue(emp.metrics.on_time_pct),
    'مهام متأخرة': emp.metrics.late_count,
    'متوسط التأخير (يوم)': metricValue(emp.metrics.avg_delay_days),
    'متوسط جولات التعديل': metricValue(emp.metrics.avg_rounds),
    'سرعة أول نسخة (يوم)': metricValue(emp.metrics.avg_days_to_first_submission),
    'انتظار المراجعة (ساعة)': metricValue(emp.metrics.avg_review_wait_hours),
    'متأخرة ولم ترفع': emp.metrics.open_overdue,
    'حضور': emp.attendance.present_days,
    'تأخير حضور': emp.attendance.late_days,
    'غياب': emp.attendance.absent_days,
    'ساعات': emp.attendance.total_hours,
  }));

  const taskRows = report.employees.flatMap((emp) =>
    monthTasks(emp, report.month).map((task) => ({
      'الموظف': emp.display_name,
      'المهمة': task.title,
      'الديدلاين': task.due_date || '',
      'أول رفع': task.first_submitted_at || '',
      'الالتزام': task.on_time === null ? '-' : task.on_time ? 'في الموعد' : 'متأخر',
      'أيام التأخير': task.delay_days ?? '',
      'جولات التعديل': task.review_rounds,
      'التسليم النهائي': task.delivered_at || '',
    })),
  );

  const trendRows = trends.months.map((point) => ({
    'الشهر': point.month,
    'التسليمات': point.deliveries,
    'الالتزام %': metricValue(point.on_time_pct),
    'مهام متأخرة': point.late_count,
    'متوسط التأخير (يوم)': metricValue(point.avg_delay_days),
    'جولات التعديل': metricValue(point.avg_rounds),
    'سرعة أول نسخة (يوم)': metricValue(point.avg_days_to_first_submission),
    'انتظار المراجعة (ساعة)': metricValue(point.avg_review_wait_hours),
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Tasks');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Trends');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function drawRtl(doc: jsPDF, text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) {
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
  drawRtl(doc, 'تقرير الإنتاجية الشهري', 195, y, { size: 18, bold: true, color: [249, 115, 22] });
  y += 8;
  drawRtl(doc, `الشهر: ${report.month}`, 195, y, { size: 11 });
  y += 10;

  drawRtl(doc, 'ملخص الموظفين', 195, y, { size: 13, bold: true });
  y += 7;
  for (const emp of report.employees) {
    y = ensurePage(doc, y, 18);
    drawRtl(doc, emp.display_name, 195, y, { size: 11, bold: true });
    y += 6;
    drawRtl(
      doc,
      `تسليمات: ${emp.metrics.deliveries} | التزام: ${metricValue(emp.metrics.on_time_pct)}% | تأخير: ${metricValue(emp.metrics.avg_delay_days)} يوم | جولات: ${metricValue(emp.metrics.avg_rounds)} | حضور: ${emp.attendance.present_days} | غياب: ${emp.attendance.absent_days}`,
      195,
      y,
      { size: 9 },
    );
    y += 7;
  }

  y += 3;
  y = ensurePage(doc, y, 38);
  drawRtl(doc, 'اتجاه آخر 6 شهور', 195, y, { size: 13, bold: true });
  y += 7;
  for (const point of trends.months) {
    y = ensurePage(doc, y, 7);
    drawRtl(
      doc,
      `${point.month} | تسليمات ${point.deliveries} | التزام ${metricValue(point.on_time_pct)}% | جولات ${metricValue(point.avg_rounds)} | سرعة ${metricValue(point.avg_days_to_first_submission)} يوم`,
      195,
      y,
      { size: 8.5 },
    );
    y += 6;
  }

  y += 4;
  y = ensurePage(doc, y, 18);
  drawRtl(doc, 'تفاصيل المهام', 195, y, { size: 13, bold: true });
  y += 7;
  for (const emp of report.employees) {
    const tasks = monthTasks(emp, report.month);
    if (!tasks.length) continue;
    y = ensurePage(doc, y, 10);
    drawRtl(doc, emp.display_name, 195, y, { size: 10, bold: true });
    y += 6;
    for (const task of tasks) {
      y = ensurePage(doc, y, 8);
      const state = task.on_time === null ? '-' : task.on_time ? 'في الموعد' : `متأخر ${task.delay_days ?? 0} يوم`;
      drawRtl(
        doc,
        `${task.title} | ديدلاين: ${task.due_date || '-'} | أول رفع: ${task.first_submitted_at ? task.first_submitted_at.slice(0, 10) : '-'} | ${state} | جولات: ${task.review_rounds}`,
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
    drawRtl(doc, `صفحة ${page} من ${pageCount}`, 195, 290, { size: 8, color: [110, 110, 110] });
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

    const body = buildWorkbook(report, trends);
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
