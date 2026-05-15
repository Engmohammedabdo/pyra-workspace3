'use client';

/**
 * Lead Detail page client.
 *
 * Layout:
 *   <Header>          full-width
 *   <StatStrip>       full-width on desktop, stacks on mobile
 *   <Tabs>            full-width tab list
 *     ┌─ Tab body ──────────────────┬─ Sidebar ─────────┐
 *     │  overview / activity / etc.  │ contact, follow-up,│
 *     │                              │ tags, custom flds  │
 *     └──────────────────────────────┴────────────────────┘
 *
 * Tab state lives in URL `?tab=overview|activity|deals|files|notes` so links
 * are shareable and the back button works.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, LayoutDashboard, Activity, FileSignature, Paperclip, StickyNote,
  Info, ChevronLeft,
} from 'lucide-react';
import { useLead, useLinkClient } from '@/hooks/useLeads';
import { usePermission } from '@/hooks/usePermission';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useLeadActivities } from '@/hooks/useLeadActivities';
import { LeadHeader } from '@/components/crm/lead-detail/lead-header';
import { LeadStatStrip } from '@/components/crm/lead-detail/lead-stat-strip';
import { LeadOverviewTab } from '@/components/crm/lead-detail/lead-overview-tab';
import { LeadActivityTab } from '@/components/crm/lead-detail/lead-activity-tab';
import { LeadDealsTab } from '@/components/crm/lead-detail/lead-deals-tab';
import { LeadAttachmentsTab } from '@/components/crm/lead-detail/lead-attachments-tab';
import { LeadNotesTab } from '@/components/crm/lead-detail/lead-notes-tab';
import { LeadSidebar } from '@/components/crm/lead-detail/lead-sidebar';
import { FollowUpModal } from '@/components/crm/follow-up-modal/follow-up-modal';
import LinkClientModal from '@/components/crm/lead-detail/link-client-modal';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

const VALID_TABS = ['overview', 'activity', 'deals', 'files', 'notes'] as const;
type TabKey = (typeof VALID_TABS)[number];

const TAB_DEFS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { key: 'activity', label: 'النشاط',     icon: Activity },
  { key: 'deals',    label: 'الصفقات',    icon: FileSignature },
  // Phase 15.2 Commit 1 — repurposed: this was the "files" placeholder
  // promised in v1.1, now the canonical attachments surface. The tab KEY
  // stays `files` for URL/router stability (old `?tab=files` bookmarks
  // still land here). Label + icon updated to match the new semantics.
  { key: 'files',    label: 'مرفقات',      icon: Paperclip },
  { key: 'notes',    label: 'الملاحظات',  icon: StickyNote },
];

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabParam = sp.get('tab');
  const activeTab: TabKey = (VALID_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as TabKey)
    : 'overview';
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [linkClientOpen, setLinkClientOpen] = useState(false);
  // Phase 10 Commit 2 — sidebar Sheet for mobile (max-md). Desktop (md+)
  // continues to render <LeadSidebar> inline in the 2-col grid.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canLinkClient = usePermission('leads.update');
  const linkClientMutation = useLinkClient();

  const handleLinkClient = async (clientId: string) => {
    try {
      await linkClientMutation.mutateAsync({ leadId, clientId });
      toast.success('تم الربط بنجاح');
      setLinkClientOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الربط');
    }
  };

  const { data, isLoading, error } = useLead(leadId);
  const { data: stages } = usePipelineStages();

  // Latest activity timestamp — used for the stat-strip "آخر نشاط".
  // We piggy-back on the same useLeadActivities query the Activity tab uses
  // so it's a single network round-trip per page open.
  const activitiesQuery = useLeadActivities(leadId);
  const latestActivityAt = useMemo(() => {
    return activitiesQuery.data?.pages?.[0]?.activities?.[0]?.created_at ?? null;
  }, [activitiesQuery.data]);

  const switchTab = useCallback(
    (next: TabKey) => {
      const nextParams = new URLSearchParams(sp.toString());
      if (next === 'overview') nextParams.delete('tab');
      else nextParams.set('tab', next);
      const qs = nextParams.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, sp],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6">
        <p className="text-destructive">تعذّر تحميل بيانات الـ Lead — تأكد من الصلاحيات أو من أن الـ Lead لم يتم حذفه.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/dashboard/crm/pipeline"><ArrowLeft className="size-4 me-2" /> عودة للـ Pipeline</Link>
        </Button>
      </Card>
    );
  }

  const { lead } = data;

  return (
    <div className="space-y-4">
      <LeadHeader
        lead={lead}
        client_name={data.lead.client_name ?? null}
        stages={stages}
        onAddNote={() => switchTab('activity')}
        onScheduleFollowUp={() => setFollowUpOpen(true)}
        onLinkClient={() => setLinkClientOpen(true)}
        canLinkClient={canLinkClient}
      />
      <FollowUpModal open={followUpOpen} onOpenChange={setFollowUpOpen} leadId={lead.id} />
      {/* Phase 11.5 — conditional mount: the modal owns a useClients query that
          should NOT fire on every lead detail page load (Reviewer finding 2).
          Trade-off: loses Dialog exit animation (modal unmounts on close); the
          net win is meaningful network savings on every lead detail visit. */}
      {linkClientOpen && (
        <LinkClientModal
          leadId={leadId}
          open={linkClientOpen}
          onClose={() => setLinkClientOpen(false)}
          onConfirm={handleLinkClient}
          confirming={linkClientMutation.isPending}
        />
      )}
      <LeadStatStrip lead={lead} lastActivityAt={latestActivityAt} />

      <Tabs value={activeTab} onValueChange={(v) => switchTab(v as TabKey)} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto rounded-xl h-auto p-1">
          {TAB_DEFS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm px-3 py-1.5"
              >
                <Icon className="size-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4 items-start">
          <div className="min-w-0">
            {/* Phase 10 Commit 2 — mobile-only sidebar trigger. Visible only at
                max-md; desktop renders the sidebar inline below. */}
            <div className="md:hidden mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="w-full justify-start"
                aria-label="عرض المعلومات الإضافية للـ Lead"
              >
                <Info className="size-4 me-2" />
                <span>معلومات إضافية</span>
                <ChevronLeft className="size-4 ms-auto" aria-hidden />
              </Button>
            </div>

            <TabsContent value="overview" className="m-0">
              <LeadOverviewTab data={data} onSwitchTab={switchTab} />
            </TabsContent>
            <TabsContent value="activity" className="m-0">
              <Card className="p-4">
                <LeadActivityTab leadId={lead.id} />
              </Card>
            </TabsContent>
            <TabsContent value="deals" className="m-0">
              <LeadDealsTab data={data} />
            </TabsContent>
            <TabsContent value="files" className="m-0">
              <Card className="p-4"><LeadAttachmentsTab leadId={lead.id} /></Card>
            </TabsContent>
            <TabsContent value="notes" className="m-0">
              <Card className="p-4"><LeadNotesTab leadId={lead.id} /></Card>
            </TabsContent>
          </div>
          {/* Phase 10 Commit 2 — hide inline sidebar on mobile (max-md);
              replaced by the Sheet below. Desktop (md+) renders this in the
              second grid column. */}
          <div className="hidden md:block">
            <LeadSidebar lead={lead} />
          </div>
        </div>
      </Tabs>

      {/* Phase 10 Commit 2 — mobile sidebar Sheet. Slides from the inline-end
          (visual right in RTL is the natural "sidebar opens" direction).
          Rendered once at the page root, controlled by sidebarOpen state.
          Mounts unconditionally; Sheet's data-state="closed" keeps the DOM
          near-empty when not open. */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="right"
          className="w-[90vw] sm:max-w-md overflow-y-auto p-4"
        >
          <SheetHeader className="pb-4">
            <SheetTitle>معلومات إضافية</SheetTitle>
            <SheetDescription className="sr-only">
              تفاصيل الـ Lead الإضافية: جهة الاتصال، الـ Follow-up التالي، الحقول المخصصة.
            </SheetDescription>
          </SheetHeader>
          <LeadSidebar lead={lead} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
