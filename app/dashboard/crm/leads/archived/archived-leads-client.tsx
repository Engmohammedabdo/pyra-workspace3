'use client';

/**
 * /dashboard/crm/leads/archived — archived (soft-deleted) leads.
 *
 * Archived leads are hidden from the pipeline + lists (GET /api/crm/leads
 * filters archived_at IS NULL by default). This admin utility lists them via
 * useLeads({ archived: 'only' }) so they can be reviewed and restored. Restore
 * uses useArchiveLead({ id, unarchive: true }). Server scope
 * (getLeadScopeFilter) still applies — a sales agent sees only their OWN
 * archived leads.
 *
 * Mirrors the customers-list-client table pattern (Phase 9): simple list,
 * client-side search over the loaded page (limit 50), no per-row aggregates.
 */

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLeads, useArchiveLead } from '@/hooks/useLeads';
import { usePermission } from '@/hooks/usePermission';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Archive, Search, ArrowLeft, ArchiveRestore } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';

const VISIBLE_LIMIT = 50;

export function ArchivedLeadsClient() {
  const [searchQuery, setSearchQuery] = useState('');
  const canRestore = usePermission('leads.delete');
  const { data, isLoading } = useLeads({
    archived: 'only',
    limit: String(VISIBLE_LIMIT),
    sort: 'updated_at',
  });

  const all = data?.leads ?? [];
  const filtered = searchQuery.trim()
    ? all.filter((lead) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          lead.name?.toLowerCase().includes(q) ||
          (lead.company ?? '').toLowerCase().includes(q) ||
          (lead.phone ?? '').toLowerCase().includes(q)
        );
      })
    : all;

  return (
    <div className="space-y-4">
      {/* Header */}
      <header>
        <Button asChild variant="ghost" size="sm" className="-ms-2 mb-1">
          <Link href="/dashboard/crm/pipeline">
            <ArrowLeft className="size-4 me-1" /> خط المبيعات
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Archive className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-bold">أرشيف الـ Leads</h1>
          {!isLoading && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              ({all.length})
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          الـ Leads المؤرشفة مخفية من خط المبيعات والقوائم. تقدر تراجعها هنا وتسترجع أي واحد.
        </p>
      </header>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="ابحث بالاسم أو الشركة أو الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-10"
        />
      </div>

      {/* Table / skeleton / empty */}
      {isLoading ? (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </Card>
      ) : all.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Archive}
            title="لا يوجد Leads مؤرشفة"
            description="لما تأرشف Lead من صفحة تفاصيله، هيظهر هنا وتقدر تسترجعه في أي وقت."
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Search}
            title="لا توجد نتائج"
            description={`لم يتم العثور على نتائج تطابق "${searchQuery}".`}
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border" role="list">
            {filtered.map((lead) => (
              <li
                key={lead.id}
                className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
              >
                <Link
                  href={`/dashboard/crm/leads/${lead.id}`}
                  className="flex-1 min-w-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 rounded"
                >
                  <div className="font-medium truncate group-hover:text-orange-600 dark:group-hover:text-orange-400">
                    {lead.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.company || lead.phone || lead.email || '—'}
                    {lead.archived_at && (
                      <>
                        {' · '}
                        أُرشِف {formatRelativeDate(lead.archived_at)}
                        {lead.archived_by ? ` بواسطة @${lead.archived_by}` : ''}
                      </>
                    )}
                  </div>
                </Link>
                {canRestore && <RestoreButton leadId={lead.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RestoreButton({ leadId }: { leadId: string }) {
  const restore = useArchiveLead();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={restore.isPending}
      className="shrink-0"
      onClick={async () => {
        try {
          await restore.mutateAsync({ id: leadId, unarchive: true });
          toast.success('تم استرجاع الـ Lead');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل الاسترجاع');
        }
      }}
    >
      <ArchiveRestore className="size-4 me-1.5" /> استرجاع
    </Button>
  );
}
