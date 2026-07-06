'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Repeat, Plus, Search, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRecurringInvoices } from '@/hooks/useRecurring';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { RecurringSummary } from '@/components/dashboard/recurring-list/RecurringSummary';
import { RecurringTable } from '@/components/dashboard/recurring-list/RecurringTable';

export default function RecurringInvoicesPage() {
  const t = useTranslations('finance.recurring.list');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), pageSize: '20' };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [page, search, statusFilter]);

  const { data: items = [], isLoading: loading } = useRecurringInvoices(params);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/finance/recurring-invoices/${id}`, 'DELETE'),
    onSuccess: () => { toast.success(t('toasts.deleteSuccess')); setDeleteId(null); invalidate(); },
    onError: () => toast.error(t('toasts.deleteFailed')),
  });

  const generateMutation = useMutation({
    mutationFn: () => mutateAPI('/api/finance/recurring-invoices/generate', 'POST'),
    onSuccess: () => { toast.success(t('toasts.generateSuccess')); invalidate(); },
    onError: () => toast.error(t('toasts.generateFailed')),
  });

  const activeCount = items.filter((i: any) => i.status === 'active').length;
  const dueCount = items.filter((i: any) => i.status === 'active' && new Date(i.next_date || '') <= new Date()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance" aria-label={t('backAria')}><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Repeat className="h-6 w-6" aria-hidden="true" /> {t('title')}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>{generateMutation.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Zap className="h-4 w-4 me-2" />}{generateMutation.isPending ? t('generating') : t('generateButton')}</Button>
          <Link href="/dashboard/finance/recurring/new"><Button><Plus className="h-4 w-4 me-2" /> {t('addButton')}</Button></Link>
        </div>
      </div>

      <RecurringSummary total={items.length} activeCount={activeCount} dueCount={dueCount} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="ps-10" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder={t('filters.statusPlaceholder')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="active">{t('filters.active')}</SelectItem>
            <SelectItem value="paused">{t('filters.paused')}</SelectItem>
            <SelectItem value="cancelled">{t('filters.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <Skeleton className="h-96 w-full" /> : <RecurringTable items={items} onDelete={setDeleteId} />}

      <Dialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deleteDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t('deleteDialog.confirm')}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t('deleteDialog.cancel')}</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('deleteDialog.deleting')}</> : t('deleteDialog.confirmButton')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
