'use client';

/**
 * Admin error log viewer (Phase 14.1, Commit 3).
 *
 * Page surfaces rows from pyra_error_logs with filters, paginated list,
 * and a right-slide-out Sheet for detail + resolve. Q3(a) — Sheet, not
 * Dialog/dedicated route (matches Phase 10 mobile pattern; doesn't
 * disrupt list context on close).
 *
 * Permission gate is enforced server-side (page.tsx requirePermission +
 * API requireApiPermission). This client component assumes the user
 * already passed both gates.
 *
 * PII redaction guarantee: rows render AS-STORED. logError redacted
 * before insert (Commit 1). No "expand original" feature — admin sees
 * [EMAIL] / [PHONE] / [REDACTED] verbatim, never the original value.
 */

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Info,
  AlertCircle,
  Bug,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { toast } from 'sonner';
import {
  useErrorLogs,
  useResolveErrorLog,
  type ErrorLog,
  type ErrorLogSeverity,
  type ErrorLogEnvironment,
} from '@/hooks/useErrorLogs';

type SeverityFilter = 'all' | ErrorLogSeverity;
type EnvironmentFilter = 'all' | ErrorLogEnvironment;
type ResolvedFilter = 'unresolved' | 'resolved' | 'all';
type DateRangeFilter = '7d' | '30d' | 'all';

const PAGE_SIZE = 50;

export function ErrorLogsClient() {
  const t = useTranslations('admin.errorLogs');
  const tCommon = useTranslations('common');
  const resolvedLabel = useStatusLabels('resolvedState');
  const severityLabelFn = useStatusLabels('errorSeverity');
  const environmentLabelFn = useStatusLabels('errorEnvironment');

  // ── Filter state ──
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<EnvironmentFilter>('all');
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>('unresolved');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('30d');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  // Build query params for the hook.
  const queryParams = useMemo(() => {
    const p: Record<string, string | undefined> = {
      page: String(page),
      limit: String(PAGE_SIZE),
    };
    if (severityFilter !== 'all') p.severity = severityFilter;
    if (environmentFilter !== 'all') p.environment = environmentFilter;
    if (resolvedFilter === 'unresolved') p.resolved = 'false';
    else if (resolvedFilter === 'resolved') p.resolved = 'true';
    if (userIdFilter.trim()) p.user_id = userIdFilter.trim();
    if (dateRangeFilter === '7d') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      p.since = since;
    } else if (dateRangeFilter === '30d') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      p.since = since;
    }
    return p;
  }, [severityFilter, environmentFilter, resolvedFilter, userIdFilter, dateRangeFilter, page]);

  const { data, isLoading, refetch, isFetching } = useErrorLogs(queryParams);
  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetFilters() {
    setSeverityFilter('all');
    setEnvironmentFilter('all');
    setResolvedFilter('unresolved');
    setDateRangeFilter('30d');
    setUserIdFilter('');
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="size-6 text-orange-500" /> {t('heading')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="gap-1.5 shrink-0"
        >
          {isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {t('refresh')}
        </Button>
      </header>

      {/* ── Filters ── */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t('filters.resolvedStateLabel')}</label>
            <FilterChipRow
              value={resolvedFilter}
              onChange={(v) => {
                setResolvedFilter(v as ResolvedFilter);
                setPage(1);
              }}
              options={[
                { key: 'unresolved', label: resolvedLabel('unresolved') },
                { key: 'resolved', label: resolvedLabel('resolved') },
                { key: 'all', label: tCommon('all') },
              ]}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t('filters.severityLabel')}</label>
            <FilterChipRow
              value={severityFilter}
              onChange={(v) => {
                setSeverityFilter(v as SeverityFilter);
                setPage(1);
              }}
              options={[
                { key: 'all', label: tCommon('all') },
                { key: 'error', label: severityLabelFn('error') },
                { key: 'warning', label: severityLabelFn('warning') },
                { key: 'info', label: severityLabelFn('info') },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t('filters.environmentLabel')}</label>
            <FilterChipRow
              value={environmentFilter}
              onChange={(v) => {
                setEnvironmentFilter(v as EnvironmentFilter);
                setPage(1);
              }}
              options={[
                { key: 'all', label: tCommon('all') },
                { key: 'production', label: environmentLabelFn('production') },
                { key: 'development', label: environmentLabelFn('development') },
              ]}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t('filters.periodLabel')}</label>
            <FilterChipRow
              value={dateRangeFilter}
              onChange={(v) => {
                setDateRangeFilter(v as DateRangeFilter);
                setPage(1);
              }}
              options={[
                { key: '7d', label: t('filters.range7d') },
                { key: '30d', label: t('filters.range30d') },
                { key: 'all', label: tCommon('all') },
              ]}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">{t('filters.userLabel')}</label>
            <Input
              value={userIdFilter}
              onChange={(e) => {
                setUserIdFilter(e.target.value);
                setPage(1);
              }}
              placeholder={t('filters.userPlaceholder')}
              className="h-9"
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('filters.recordCount', { total })} · {tCommon('pagination.pageOf', { page, totalPages })}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-orange-600 dark:text-orange-400 hover:underline"
          >
            {t('filters.resetFilters')}
          </button>
        </div>
      </Card>

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={
            resolvedFilter === 'unresolved'
              ? t('empty.titleUnresolved')
              : t('empty.titleFiltered')
          }
          description={
            resolvedFilter === 'unresolved'
              ? t('empty.descriptionUnresolved')
              : t('empty.descriptionFiltered')
          }
        />
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} onSelect={() => setSelectedLog(log)} />
          ))}
        </ul>
      )}

      {/* ── Pagination ── */}
      {logs.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="gap-1.5"
          >
            <ChevronRight className="size-3.5" />
            {t('pagination.prev')}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tCommon('pagination.pageOf', { page, totalPages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="gap-1.5"
          >
            {t('pagination.next')}
            <ChevronLeft className="size-3.5" />
          </Button>
        </div>
      )}

      {/* ── Detail Sheet ── */}
      {/* Q3(a) — Sheet with side="right" (in RTL = visual LEFT), matches
          Phase 10 pattern. Closes by clicking outside or pressing ESC; list
          state preserved (no scroll reset on close). */}
      <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
        >
          {selectedLog && (
            <LogDetailPanel
              log={selectedLog}
              onResolved={(updated) => {
                setSelectedLog(updated);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────

function LogRow({ log, onSelect }: { log: ErrorLog; onSelect: () => void }) {
  const locale = useLocale();
  const resolvedLabel = useStatusLabels('resolvedState');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full text-start',
          'rounded-lg border border-border bg-card p-4',
          'hover:bg-muted/30 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <SeverityBadge severity={log.severity} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold leading-5 truncate" dir="auto">
                {log.message}
              </p>
              {log.resolved && (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 text-[10px]"
                >
                  <CheckCircle2 className="size-3 me-1" />
                  {resolvedLabel('resolved')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span title={formatDate(log.created_at, 'eeee dd-MM-yyyy HH:mm', locale)} className="tabular-nums">
                {formatRelativeDate(log.created_at, locale)}
              </span>
              <span>·</span>
              <EnvBadge environment={log.environment} />
              {log.error_type && (
                <>
                  <span>·</span>
                  <span className="font-mono">{log.error_type}</span>
                </>
              )}
              {log.user_id && (
                <>
                  <span>·</span>
                  <span>@{log.user_id}</span>
                </>
              )}
              {log.request_path && (
                <>
                  <span>·</span>
                  <span className="font-mono truncate max-w-[200px]" title={log.request_path}>
                    {log.request_method} {log.request_path}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Detail panel ──────────────────────────────────────────

function LogDetailPanel({
  log,
  onResolved,
}: {
  log: ErrorLog;
  onResolved: (updated: ErrorLog) => void;
}) {
  const t = useTranslations('admin.errorLogs');
  const locale = useLocale();
  const resolvedLabel = useStatusLabels('resolvedState');
  const [notes, setNotes] = useState('');
  const resolve = useResolveErrorLog();

  async function handleResolve() {
    try {
      const res = await resolve.mutateAsync({
        id: log.id,
        resolved_notes: notes.trim() || undefined,
      });
      toast.success(t('toasts.resolveSuccess'));
      onResolved(res.log);
    } catch (err) {
      console.error('Resolve failed:', err);
      const msg = err instanceof Error ? err.message : t('toasts.resolveError');
      toast.error(msg);
    }
  }

  // Pretty-print metadata. PII is already redacted at insert time —
  // we render exactly what's stored. No de-redaction, no "expand
  // original" path (Reviewer focus area c).
  const metadataString = useMemo(() => {
    try {
      return JSON.stringify(log.metadata ?? {}, null, 2);
    } catch {
      return '{ }';
    }
  }, [log.metadata]);

  return (
    <>
      <SheetHeader className="space-y-2 text-start">
        <SheetTitle className="flex items-center gap-2 text-lg">
          <SeverityBadge severity={log.severity} />
          <span dir="auto">{log.message}</span>
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2 flex-wrap text-xs">
          <span title={formatDate(log.created_at, 'eeee dd-MM-yyyy HH:mm', locale)} className="tabular-nums">
            {formatRelativeDate(log.created_at, locale)}
          </span>
          <span>·</span>
          <EnvBadge environment={log.environment} />
          {log.resolved && (
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
            >
              <CheckCircle2 className="size-3 me-1" />
              {resolvedLabel('resolved')}
            </Badge>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4 text-sm">
        {/* ── Error type ── */}
        {log.error_type && (
          <Section title={t('detail.type')}>
            <code className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded">
              {log.error_type}
            </code>
          </Section>
        )}

        {/* ── Stack trace ── */}
        {log.stack_trace && (
          <Section title={t('detail.stackTrace')}>
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto max-h-[40vh] whitespace-pre-wrap break-all leading-relaxed">
              {log.stack_trace}
            </pre>
          </Section>
        )}

        {/* ── Request context ── */}
        {(log.request_path || log.user_id) && (
          <Section title={t('detail.context')}>
            <dl className="text-xs space-y-1">
              {log.request_method && log.request_path && (
                <Row label={t('detail.path')}>
                  <span className="font-mono">{log.request_method} {log.request_path}</span>
                </Row>
              )}
              {log.user_id && (
                <Row label={t('detail.user')}>
                  @{log.user_id}
                  {log.user_role && <span className="text-muted-foreground"> · {log.user_role}</span>}
                </Row>
              )}
            </dl>
          </Section>
        )}

        {/* ── Metadata (already PII-redacted) ── */}
        <Section title={t('detail.metadata')}>
          <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto max-h-[30vh] whitespace-pre-wrap break-all leading-relaxed">
            {metadataString}
          </pre>
        </Section>

        {/* ── Resolution ── */}
        {log.resolved ? (
          <Section title={t('detail.resolutionDetails')}>
            <dl className="text-xs space-y-1">
              <Row label={t('detail.resolvedBy')}>@{log.resolved_by ?? t('detail.unknownUser')}</Row>
              <Row label={t('detail.resolvedAt')}>
                {log.resolved_at
                  ? formatDate(log.resolved_at, 'eeee dd-MM-yyyy HH:mm', locale)
                  : '—'}
              </Row>
              {log.resolved_notes && (
                <Row label={t('detail.notes')}>
                  <span className="whitespace-pre-wrap break-words">{log.resolved_notes}</span>
                </Row>
              )}
            </dl>
          </Section>
        ) : (
          <Section title={t('detail.markResolvedSection')}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('detail.notesPlaceholder')}
              rows={3}
              className="text-sm"
            />
            <Button
              type="button"
              onClick={() => void handleResolve()}
              disabled={resolve.isPending}
              className="w-full mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {resolve.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {t('detail.confirmResolve')}
            </Button>
          </Section>
        )}
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-muted-foreground shrink-0 w-20">{label}</dt>
      <dd className="font-medium min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function FilterChipRow({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              active
                ? 'bg-foreground text-background border-foreground'
                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ErrorLogSeverity }) {
  const severityLabelFn = useStatusLabels('errorSeverity');
  const map = {
    error: {
      cls: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40',
      icon: AlertCircle,
    },
    warning: {
      cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
      icon: AlertTriangle,
    },
    info: {
      cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
      icon: Info,
    },
  } as const;
  const cfg = map[severity];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn(cfg.cls, 'gap-1')}>
      <Icon className="size-3" />
      {severityLabelFn(severity)}
    </Badge>
  );
}

function EnvBadge({ environment }: { environment: ErrorLogEnvironment }) {
  const environmentLabelFn = useStatusLabels('errorEnvironment');
  if (environment === 'production') {
    return (
      <Badge
        variant="outline"
        className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40 text-[10px]"
      >
        {environmentLabelFn('production')}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/40 text-[10px]"
    >
      {environmentLabelFn('development')}
    </Badge>
  );
}
