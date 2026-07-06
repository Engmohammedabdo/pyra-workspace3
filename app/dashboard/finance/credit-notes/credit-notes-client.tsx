'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRight, FileCheck, Plus, Trash2 } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  client_name: string | null;
  client_company: string | null;
  reason: string;
  status: string;
  issue_date: string;
  total: number;
  applied_amount: number;
  currency: string;
}

export default function CreditNotesClient() {
  const t = useTranslations('finance.creditNotes.list');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('creditNote');
  const router = useRouter();
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/dashboard/credit-notes?${params}`);
      const json = await res.json();
      if (json.data) setNotes(json.data);
      if (json.meta) setTotal(json.meta.total || 0);
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileCheck className="h-6 w-6" aria-hidden="true" /> {t('title')}
          </h1>
        </div>
        <Link href="/dashboard/finance/credit-notes/new">
          <Button><Plus className="h-4 w-4 me-2" /> {t('newCreditNote')}</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder={t('filters.searchPlaceholder')}
          className="flex-1 min-w-[200px]"
        />
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('filters.statusPlaceholder')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
            <SelectItem value="draft">{statusLabelFor('draft')}</SelectItem>
            <SelectItem value="issued">{statusLabelFor('issued')}</SelectItem>
            <SelectItem value="applied">{statusLabelFor('applied')}</SelectItem>
            <SelectItem value="cancelled">{statusLabelFor('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title={t('emptyState.title')}
          description={t('emptyState.description')}
          actionLabel={t('emptyState.actionLabel')}
          onAction={() => router.push('/dashboard/finance/credit-notes/new')}
        />
      ) : (
        <div className="space-y-3">
          {notes.map(cn => {
            const statusLabel = statusLabelFor(cn.status) || cn.status;
            return (
              <Link key={cn.id} href={`/dashboard/finance/credit-notes/${cn.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileCheck className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" dir="ltr">{cn.credit_note_number}</span>
                          <Badge className={getStatusBadgeClass(cn.status)}>{statusLabel}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {cn.client_name || t('noClient')} — {cn.reason?.slice(0, 50)}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-bold font-mono">{formatCurrency(cn.total, cn.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(cn.issue_date, undefined, locale)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('pagination.prev')}</Button>
          <span className="text-sm text-muted-foreground">{t('pagination.pageOf', { page, totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('pagination.next')}</Button>
        </div>
      )}
    </div>
  );
}
