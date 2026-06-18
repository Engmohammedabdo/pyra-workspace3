'use client';

/**
 * Right sidebar on the Lead Detail page (desktop) / collapsible section (mobile).
 *
 * Sections:
 *   - Contact info (phone, email, contact_person + role, decision_maker, industry, company_size)
 *   - Next follow-up (pulled from useFollowUps for this lead)
 *   - Custom fields (lead.custom_fields jsonb — rendered if non-empty)
 *
 * Tags: deferred to Phase 6 when label assignment lands. The slot is rendered
 * with an empty state for now so the Phase 6 wire-up is mechanical.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Phone, Mail, User, UserCheck, UserCog, Building2, Users2, Tag, CalendarClock, Check, Loader2,
} from 'lucide-react';
import { useFollowUps, useCompleteFollowUp, type FollowUpsResponse } from '@/hooks/useFollowUps';
import { fetchAPI } from '@/hooks/api-helpers';
import { formatRelativeDate } from '@/lib/utils/format';
import type { PyraSalesLead } from '@/types/database';

interface LeadSidebarProps {
  lead: PyraSalesLead;
}

export function LeadSidebar({ lead }: LeadSidebarProps) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const { data: followUpsRes } = useFollowUps({
    lead_id: lead.id,
    status: 'pending',
    limit: '1',
  });
  const nextFollowUp = followUpsRes?.follow_ups?.[0];
  const complete = useCompleteFollowUp();

  // Current owner — display gap fix (Commit 1 / Option A): the assignee was
  // never surfaced on the lead detail. Resolve display_name via the shared
  // ['users','lite'] query (deduped with the reassign modal); fall back to the
  // raw username, which still resolves for an inactive owner (e.g. a departed
  // agent whose leads haven't been reassigned yet).
  const { data: liteUsers = [] } = useQuery<Array<{ username: string; display_name: string }>>({
    queryKey: ['users', 'lite'],
    queryFn: () => fetchAPI('/api/users/lite'),
    staleTime: 5 * 60_000,
  });
  const assigneeName = lead.assigned_to
    ? liteUsers.find((u) => u.username === lead.assigned_to)?.display_name ?? lead.assigned_to
    : 'غير مُسند';

  // Phase 15.1 Commit 5 — follow-up highlight handler (LOCK 1). Triggered
  // by `?followup={fu_id}` deep-links from the calendar event pill. The
  // sidebar only renders the NEXT pending follow-up (limit:1), so the
  // handler is a graceful no-op when the targeted follow-up isn't the
  // currently-shown one — the user still lands on the lead detail page,
  // which is the better-than-nothing fallback.
  //
  // Mirrors the Commit 1 activity-highlight pattern: data-attribute on the
  // target element + querySelector(CSS.escape) + scrollIntoView + ring-flash
  // + cleanup function clearing the timeout and removing the classes.
  const highlightFollowUp = sp.get('followup');
  useEffect(() => {
    if (!highlightFollowUp || !nextFollowUp) return;
    if (nextFollowUp.id !== highlightFollowUp) return; // not the rendered one
    let timer: ReturnType<typeof setTimeout> | null = null;
    let targetEl: HTMLElement | null = null;
    const FLASH_CLASSES = ['ring-2', 'ring-orange-400', 'ring-offset-2', 'rounded-lg'];
    const raf = requestAnimationFrame(() => {
      targetEl = document.querySelector<HTMLElement>(
        `[data-followup-id="${CSS.escape(highlightFollowUp)}"]`,
      );
      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add(...FLASH_CLASSES);
      timer = setTimeout(() => {
        targetEl?.classList.remove(...FLASH_CLASSES);
      }, 2000);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      targetEl?.classList.remove(...FLASH_CLASSES);
    };
  }, [highlightFollowUp, nextFollowUp]);

  const customFieldEntries = Object.entries(lead.custom_fields ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  // Optimistic complete: cancel in-flight queries, snapshot every cached
  // ['crm','follow-ups',…] entry, optimistically remove this row from each,
  // then call the API. On error, restore the snapshots; on success the
  // hook's onSuccess handler invalidates and reconciles.
  async function handleComplete() {
    if (!nextFollowUp) return;
    const id = nextFollowUp.id;

    await qc.cancelQueries({ queryKey: ['crm', 'follow-ups'] });

    const snapshots = qc.getQueriesData<FollowUpsResponse>({ queryKey: ['crm', 'follow-ups'] });

    qc.setQueriesData<FollowUpsResponse>({ queryKey: ['crm', 'follow-ups'] }, (old) => {
      if (!old || !Array.isArray(old.follow_ups)) return old;
      const next = old.follow_ups.filter((f) => f.id !== id);
      if (next.length === old.follow_ups.length) return old;
      return { ...old, follow_ups: next, total: Math.max(0, (old.total ?? 0) - 1) };
    });

    try {
      await complete.mutateAsync({ id });
      toast.success('تمّت المتابعة');
    } catch (err) {
      console.error('Complete follow-up failed:', err);
      for (const [key, data] of snapshots) {
        qc.setQueryData(key, data);
      }
      toast.error('فشل إكمال المتابعة');
    }
  }

  return (
    <aside className="space-y-3">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">معلومات الاتصال</h3>
        <ul className="space-y-2 text-sm">
          <Row icon={<UserCog className="size-4" />} label="المسؤول" value={assigneeName} />
          {lead.phone && <Row icon={<Phone className="size-4" />} label="هاتف" value={lead.phone} />}
          {lead.email && <Row icon={<Mail className="size-4" />} label="إيميل" value={lead.email} />}
          {lead.contact_person && (
            <Row
              icon={<User className="size-4" />}
              label="جهة الاتصال"
              value={lead.contact_role ? `${lead.contact_person} · ${lead.contact_role}` : lead.contact_person}
            />
          )}
          {lead.decision_maker && (
            <Row icon={<UserCheck className="size-4" />} label="صاحب القرار" value={lead.decision_maker} />
          )}
          {lead.industry && <Row icon={<Building2 className="size-4" />} label="القطاع" value={lead.industry} />}
          {lead.company_size && <Row icon={<Users2 className="size-4" />} label="حجم الشركة" value={lead.company_size} />}
          {lead.budget_range && <Row icon={<Tag className="size-4" />} label="الميزانية" value={lead.budget_range} />}
          {!lead.phone && !lead.email && !lead.contact_person && (
            <li className="text-xs text-muted-foreground">لا توجد بيانات اتصال — حدّث الـ Lead لإضافتها.</li>
          )}
        </ul>
      </Card>

      <Card
        className="p-4 space-y-2"
        data-followup-id={nextFollowUp?.id}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">المتابعة القادمة</h3>
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
        </div>
        {nextFollowUp ? (
          <>
            <p className="text-sm font-medium leading-5 line-clamp-2">{nextFollowUp.title ?? 'متابعة'}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeDate(nextFollowUp.due_at)}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleComplete()}
              disabled={complete.isPending}
              className="w-full mt-2 gap-1.5"
            >
              {complete.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              تمّت المتابعة
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground leading-5">
            لا توجد متابعة مجدولة. اضغط زر "متابعة" بالأعلى لإنشاء واحدة.
          </p>
        )}
      </Card>

      {/* Phase 13 Q-001a — honest user-facing placeholder. Removes
          developer-facing language (was "إدارة العلامات — قيد البناء
          (Phase 6)"). EmptyState component swap was attempted but the
          full-page-sized icon ring + text-lg heading were
          disproportionate to the sidebar's compact card density (the
          Contact info / Next follow-up cards use text-sm headers).
          Used a size-matched inline stub instead, preserving the spec
          intent (no developer language; "قريباً في v1.1" copy) while
          respecting the sidebar's visual hierarchy. EmptyState
          size="compact" variant is v1.1 backlog. Tags feature itself
          is also v1.1 backlog. */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">العلامات</h3>
          <Tag className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">قريباً في v1.1</p>
      </Card>

      {customFieldEntries.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">حقول مخصصة</h3>
          <ul className="space-y-1.5 text-sm">
            {customFieldEntries.map(([k, v]) => (
              <li key={k} className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground capitalize text-xs">{k}</span>
                <span className="font-medium text-end">{String(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </aside>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="font-medium truncate text-end">{value}</span>
      </div>
    </li>
  );
}
