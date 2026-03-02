import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // LTR mark (\u200E) ensures correct display order in RTL contexts
  return `\u200E${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(date: string | Date, pattern: string = 'dd-MM-yyyy'): string {
  return format(new Date(date), pattern, { locale: ar });
}

export function formatRelativeDate(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar });
}

export function formatCurrency(amount: number, currency: string = 'AED'): string {
  if (!Number.isFinite(amount)) amount = 0;
  const formatted = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  // LTR mark ensures correct display order in RTL contexts
  return `\u200E${formatted}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-AE').format(num);
}
