'use client';

/**
 * /dashboard/crm/customers — list of CRM-converted leads.
 *
 * Phase 9 v1: simple table, no aggregated KPIs per row (would require a
 * new bulk endpoint or N dossier calls). Click a row → the Active Customer
 * Page at /dashboard/crm/customers/[id] which fetches that customer's
 * full dossier on demand.
 *
 * Data source: existing `useLeads({ is_converted: 'true' })` — same hook
 * that powers the pipeline list. Server-side scoping in /api/crm/leads
 * applies (sales agents see own only). No new API needed.
 *
 * v1 limitations (documented in CRM-PROGRESS.md v1.1 backlog):
 *   - No per-row aggregated KPIs (LTV/MRR/contracts count). Adding
 *     these would require either N dossier calls (bad) or a new bulk
 *     "/api/crm/customers" endpoint that joins lead + contracts
 *     summary.
 *   - No server-side pagination — limit=50 is the cap. v1.1 can add
 *     proper pagination once a real customer base accumulates.
 *   - Search is client-side over the loaded list. v1.1 can wire the
 *     existing useLeads `search` query param if list grows past 50.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Users, Search, ArrowLeft } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const VISIBLE_LIMIT = 50;

export function CustomersListClient() {
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading } = useLeads({
    is_converted: 'true',
    limit: String(VISIBLE_LIMIT),
    sort: 'updated_at',
  });

  const all = data?.leads ?? [];
  const filtered = searchQuery.trim()
    ? all.filter((lead) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          lead.name?.toLowerCase().includes(q) ||
          lead.company?.toLowerCase().includes(q) ||
          (lead.email ?? '').toLowerCase().includes(q)
        );
      })
    : all;

  return (
    <div className="space-y-4">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-bold">العملاء</h1>
          {!isLoading && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              ({all.length})
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          العملاء المحوّلين من خط المبيعات. اضغط على عميل لعرض ملف العلاقة الكامل (عقود، مشاريع، صحة العلاقة).
        </p>
      </header>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="ابحث بالاسم أو الشركة أو البريد..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-10"
        />
      </div>

      {/* Table or skeleton or empty */}
      {isLoading ? (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="size-4" />
              </div>
            ))}
          </div>
        </Card>
      ) : all.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Users}
            title="لا يوجد عملاء بعد"
            description="حوّل عميل محتمل من خط المبيعات إلى عميل دائم وسيظهر هنا."
            actions={[
              {
                label: 'فتح خط المبيعات',
                variant: 'secondary',
                onClick: () => {
                  window.location.href = '/dashboard/crm/pipeline';
                },
              },
            ]}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Search}
            title="لا توجد نتائج"
            description={`لم يتم العثور على عملاء يطابقون "${searchQuery}".`}
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border" role="list">
            {filtered.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/dashboard/crm/customers/${lead.id}`}
                  className={cn(
                    'group flex items-center gap-3 p-4 transition-colors',
                    'hover:bg-muted/40 focus:outline-none focus:bg-muted/40 focus:ring-2 focus:ring-orange-500/40',
                  )}
                >
                  <Avatar name={lead.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{lead.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {lead.company || lead.email || lead.phone || '—'}
                    </div>
                  </div>
                  {lead.assigned_to && (
                    <div className="text-xs text-muted-foreground hidden sm:block">
                      <span className="text-muted-foreground/70">مسؤول: </span>
                      <span className="text-foreground">@{lead.assigned_to}</span>
                    </div>
                  )}
                  {lead.last_contact_at && (
                    <div className="text-xs text-muted-foreground hidden md:block tabular-nums">
                      {formatRelativeDate(lead.last_contact_at)}
                    </div>
                  )}
                  <ArrowLeft className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  // Take first letter of first 2 words. Works for both Arabic and Latin.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  const initials = (first + second).toUpperCase() || '؟';
  return (
    <div className="size-10 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-300 flex items-center justify-center text-sm font-medium shrink-0">
      {initials}
    </div>
  );
}
