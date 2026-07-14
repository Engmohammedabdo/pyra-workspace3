import { cn } from '@/lib/utils/cn';

// ============================================================
// Invoice Stamp — shared rubber-stamp seal for invoice status.
// Used on BOTH the dashboard invoice detail AND the client portal
// (mirrors the PDF stamp drawn in lib/pdf/invoice-pdf.ts).
// Label text is English by design — a stamp is a locale-neutral
// visual seal (same as the PDF), so no i18n string is needed.
// ============================================================

export type InvoiceStampStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

const SLATE = 'text-slate-500 dark:text-slate-400 border-slate-400/60 ring-slate-400/25';

const STAMP_CONFIG: Record<string, { label: string; className: string }> = {
  paid: { label: 'PAID', className: 'text-green-600 dark:text-green-400 border-green-500/70 ring-green-500/25' },
  partially_paid: { label: 'PARTIALLY PAID', className: 'text-amber-600 dark:text-amber-400 border-amber-500/70 ring-amber-500/25' },
  sent: { label: 'UNPAID', className: 'text-red-600 dark:text-red-400 border-red-500/70 ring-red-500/25' },
  overdue: { label: 'OVERDUE', className: 'text-red-700 dark:text-red-400 border-red-600/70 ring-red-600/25' },
  draft: { label: 'DRAFT', className: SLATE },
  cancelled: { label: 'CANCELLED', className: SLATE },
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-[11px] px-2.5 py-0.5 border-2 ring-1 tracking-wide',
  md: 'text-base px-4 py-1.5 border-[3px] ring-2 tracking-wider',
  lg: 'text-2xl px-6 py-2.5 border-4 ring-2 tracking-widest',
};

interface InvoiceStampProps {
  /** Raw invoice status (draft | sent | partially_paid | paid | overdue | cancelled). */
  status: string;
  size?: 'sm' | 'md' | 'lg';
  /** Tilt the stamp like a real rubber stamp. Default true. */
  rotate?: boolean;
  /** Localized status label — surfaced to screen readers + as a tooltip. */
  title?: string;
  className?: string;
}

export function InvoiceStamp({ status, size = 'md', rotate = true, title, className }: InvoiceStampProps) {
  const cfg = STAMP_CONFIG[status] ?? { label: (status || '').toUpperCase() || 'UNKNOWN', className: SLATE };

  return (
    <span
      role="img"
      aria-label={title ? `${title} — ${cfg.label}` : cfg.label}
      title={title ?? cfg.label}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md bg-transparent font-extrabold uppercase leading-none whitespace-nowrap ring-inset',
        rotate && '-rotate-6',
        SIZE_CLASSES[size],
        cfg.className,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
