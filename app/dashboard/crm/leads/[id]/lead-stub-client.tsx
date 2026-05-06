'use client';

/**
 * Phase 4 placeholder for /dashboard/crm/leads/[id].
 * Phase 5 ships the full Lead Detail page (header + stats + tabs + timeline).
 *
 * For now we render the lead's name + a few core fields, which:
 *   1. confirms the GET /api/crm/leads/[id] endpoint + canAccessLead gate
 *   2. proves the pipeline-card → lead-detail navigation works
 *   3. gives the user something useful while Phase 5 lands
 */

import Link from 'next/link';
import { useLead } from '@/hooks/useLeads';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, Mail, Building2, User } from 'lucide-react';
import { PIPELINE_STAGE_LABELS_AR, type PipelineStageId } from '@/lib/constants/statuses';

export function LeadDetailStub({ leadId }: { leadId: string }) {
  const { data, isLoading, error } = useLead(leadId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6">
        <p className="text-destructive">تعذّر تحميل بيانات الـ Lead — تأكد من الصلاحيات.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/dashboard/crm/pipeline"><ArrowLeft className="size-4 me-2" /> عودة للـ Pipeline</Link>
        </Button>
      </Card>
    );
  }

  const { lead, contracts, payments_summary, activity_count, follow_ups_pending } = data;
  const stageLabel = lead.stage_id ? PIPELINE_STAGE_LABELS_AR[lead.stage_id as PipelineStageId] : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ms-2">
            <Link href="/dashboard/crm/pipeline">
              <ArrowLeft className="size-4 me-1" /> الـ Pipeline
            </Link>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            {stageLabel && (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/40">
                {stageLabel}
              </Badge>
            )}
            <Badge variant="outline" className="bg-muted/50">Phase 5 — قيد البناء</Badge>
          </div>
          {lead.company && <p className="text-sm text-muted-foreground mt-1">{lead.company}</p>}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="عقود" value={contracts.length} />
        <StatTile label="مدفوع" value={`${payments_summary.total_paid.toLocaleString()} ${payments_summary.currency}`} />
        <StatTile label="نشاط مسجّل" value={activity_count} />
        <StatTile label="متابعات قيد الانتظار" value={follow_ups_pending} />
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">معلومات أساسية</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {lead.phone && <Row icon={<Phone className="size-4" />} label="هاتف" value={lead.phone} />}
          {lead.email && <Row icon={<Mail className="size-4" />} label="إيميل" value={lead.email} />}
          {lead.contact_person && <Row icon={<User className="size-4" />} label="جهة الاتصال" value={lead.contact_person} />}
          {lead.industry && <Row icon={<Building2 className="size-4" />} label="القطاع" value={lead.industry} />}
        </div>
      </Card>

      <Card className="p-5 bg-muted/30 border-dashed">
        <p className="text-sm text-muted-foreground leading-7">
          صفحة تفاصيل الـ Lead الكاملة (Activity Timeline · Tabs · Files · Notes · Sidebar) جاية في Phase 5.
        </p>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground min-w-20">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
