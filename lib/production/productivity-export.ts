import * as XLSX from 'xlsx';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';
import { isoToDubaiDateTime } from './deadlines';
import type { TaskJourney } from './metrics';
import type { ProductivityReport, ProductivityTrends } from './report';

function monthOf(iso: string): string {
  return dubaiDayKey(new Date(iso)).slice(0, 7);
}

export function productivityMonthTasks(
  tasks: readonly TaskJourney[],
  month: string,
): TaskJourney[] {
  const isCurrentMonth = month === dubaiDayKey().slice(0, 7);
  return tasks.filter((task) => {
    if (task.delivered_at && monthOf(task.delivered_at) === month) return true;
    if (task.first_submitted_at && monthOf(task.first_submitted_at) === month) return true;
    return isCurrentMonth
      && !task.first_submitted_at
      && !task.delivered_at
      && !task.is_archived;
  });
}

function metricValue(value: number | null): string | number {
  return value === null ? '-' : value;
}

export function formatProductivityTaskInstant(instant: string | null): string {
  if (!instant) return '';
  const dateTime = isoToDubaiDateTime(instant);
  return dateTime
    ? `${dateTime.date} ${dateTime.time} (${CALENDAR_TIMEZONE_OFFSET})`
    : instant;
}

export function productivityTaskDeadlineDateTime(task: TaskJourney): string {
  if (!task.effective_due_at) return task.due_date || '';
  return formatProductivityTaskInstant(task.effective_due_at);
}

export function productivityTaskCommitmentLabel(task: TaskJourney): string {
  if (task.on_time === null) return '-';
  if (task.on_time) return 'في الموعد'; // i18n-exempt: Arabic productivity PDF/XLSX export content
  if (task.delay_days === 0) return 'متأخر في نفس اليوم'; // i18n-exempt: Arabic productivity PDF/XLSX export content
  if (task.delay_days === null) return 'متأخر'; // i18n-exempt: Arabic productivity PDF/XLSX export content
  return `متأخر ${task.delay_days} يوم`; // i18n-exempt: Arabic productivity PDF/XLSX export content
}

export function productivityAttributionReviewReason(task: TaskJourney): string {
  if (task.attribution_status === 'legacy_unverified') {
    return 'إسناد قديم غير موثوق'; // i18n-exempt: Arabic productivity PDF/XLSX export content
  }
  return 'إسناد الموظف يحتاج مراجعة'; // i18n-exempt: Arabic productivity PDF/XLSX export content
}

export function productivityTaskPdfLine(task: TaskJourney): string {
  const deadline = productivityTaskDeadlineDateTime(task) || '-';
  const firstSubmission = formatProductivityTaskInstant(task.first_submitted_at) || '-';
  return `${task.title} | ديدلاين: ${deadline} | أول رفع: ${firstSubmission} | ${productivityTaskCommitmentLabel(task)} | جولات: ${task.review_rounds}`; // i18n-exempt: Arabic productivity PDF export content
}

export function buildProductivityWorkbook(
  report: ProductivityReport,
  trends: ProductivityTrends,
): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryRows = report.employees.map((emp) => ({
    'الموظف': emp.display_name, // i18n-exempt: Arabic productivity XLSX export content
    'اسم المستخدم': emp.username, // i18n-exempt: Arabic productivity XLSX export content
    'التسليمات': emp.metrics.deliveries, // i18n-exempt: Arabic productivity XLSX export content
    'الالتزام %': metricValue(emp.metrics.on_time_pct), // i18n-exempt: Arabic productivity XLSX export content
    'مهام متأخرة': emp.metrics.late_count, // i18n-exempt: Arabic productivity XLSX export content
    'متوسط التأخير (يوم)': metricValue(emp.metrics.avg_delay_days), // i18n-exempt: Arabic productivity XLSX export content
    'متوسط جولات التعديل': metricValue(emp.metrics.avg_rounds), // i18n-exempt: Arabic productivity XLSX export content
    'سرعة أول نسخة (يوم)': metricValue(emp.metrics.avg_days_to_first_submission), // i18n-exempt: Arabic productivity XLSX export content
    'انتظار المراجعة (ساعة)': metricValue(emp.metrics.avg_review_wait_hours), // i18n-exempt: Arabic productivity XLSX export content
    'متأخرة ولم ترفع': emp.metrics.open_overdue, // i18n-exempt: Arabic productivity XLSX export content
    'حضور': emp.attendance.present_days, // i18n-exempt: Arabic productivity XLSX export content
    'تأخير حضور': emp.attendance.late_days, // i18n-exempt: Arabic productivity XLSX export content
    'غياب': emp.attendance.absent_days, // i18n-exempt: Arabic productivity XLSX export content
    'ساعات': emp.attendance.total_hours, // i18n-exempt: Arabic productivity XLSX export content
  }));

  const taskRows = report.employees.flatMap((emp) =>
    productivityMonthTasks(emp.tasks, report.month).map((task) => ({
      'الموظف': emp.display_name, // i18n-exempt: Arabic productivity XLSX export content
      'المهمة': task.title, // i18n-exempt: Arabic productivity XLSX export content
      'الديدلاين': productivityTaskDeadlineDateTime(task), // i18n-exempt: Arabic productivity XLSX export content
      'أول رفع': formatProductivityTaskInstant(task.first_submitted_at), // i18n-exempt: Arabic productivity XLSX export content
      'الالتزام': productivityTaskCommitmentLabel(task), // i18n-exempt: Arabic productivity XLSX export content
      'أيام التأخير': task.delay_days ?? '', // i18n-exempt: Arabic productivity XLSX export content
      'جولات التعديل': task.review_rounds, // i18n-exempt: Arabic productivity XLSX export content
      'التسليم النهائي': formatProductivityTaskInstant(task.delivered_at), // i18n-exempt: Arabic productivity XLSX export content
    })),
  );

  const reviewRows = productivityMonthTasks(report.unattributed_tasks, report.month).map((task) => ({
    'المهمة': task.title, // i18n-exempt: Arabic productivity XLSX export content
    'الديدلاين': productivityTaskDeadlineDateTime(task), // i18n-exempt: Arabic productivity XLSX export content
    'أول رفع': formatProductivityTaskInstant(task.first_submitted_at), // i18n-exempt: Arabic productivity XLSX export content
    'الالتزام': productivityTaskCommitmentLabel(task), // i18n-exempt: Arabic productivity XLSX export content
    'سبب المراجعة': productivityAttributionReviewReason(task), // i18n-exempt: Arabic productivity XLSX export content
  }));

  const trendRows = trends.months.map((point) => ({
    'الشهر': point.month, // i18n-exempt: Arabic productivity XLSX export content
    'التسليمات': point.deliveries, // i18n-exempt: Arabic productivity XLSX export content
    'الالتزام %': metricValue(point.on_time_pct), // i18n-exempt: Arabic productivity XLSX export content
    'مهام متأخرة': point.late_count, // i18n-exempt: Arabic productivity XLSX export content
    'متوسط التأخير (يوم)': metricValue(point.avg_delay_days), // i18n-exempt: Arabic productivity XLSX export content
    'جولات التعديل': metricValue(point.avg_rounds), // i18n-exempt: Arabic productivity XLSX export content
    'سرعة أول نسخة (يوم)': metricValue(point.avg_days_to_first_submission), // i18n-exempt: Arabic productivity XLSX export content
    'انتظار المراجعة (ساعة)': metricValue(point.avg_review_wait_hours), // i18n-exempt: Arabic productivity XLSX export content
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Tasks');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reviewRows), 'Needs Review');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Trends');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
