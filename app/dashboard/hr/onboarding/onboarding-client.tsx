'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import {
  ONBOARDING_STATUS_LABELS,
  type OnboardingStatus,
} from '@/lib/constants/onboarding';
import { useOnboardingList, type OnboardingListItem } from '@/hooks/useOnboarding';
import { NewHireWizard } from '@/components/hr/onboarding/NewHireWizard';

// ──────────────────────────────────────────────────────────────────────────────
// Status badge colours
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  in_progress: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ──────────────────────────────────────────────────────────────────────────────
// Progress bar mini
// ──────────────────────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium tabular-nums">
        {done}/{total}
      </span>
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main client component
// ──────────────────────────────────────────────────────────────────────────────

export default function OnboardingClient() {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data, isLoading } = useOnboardingList();
  const rows = data?.onboardings ?? [];

  const columns: ColumnDef<OnboardingListItem>[] = [
    {
      key: 'employee',
      header: 'الموظف',
      render: (row) => (
        <span className="font-medium">{row.employee_display_name}</span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => (
        <Badge
          className={`text-xs ${STATUS_CLASS[row.status] ?? ''}`}
          variant="outline"
        >
          {ONBOARDING_STATUS_LABELS[row.status as OnboardingStatus] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'progress',
      header: 'المهام',
      render: (row) => (
        <ProgressBar
          done={row.task_progress.done}
          total={row.task_progress.total}
        />
      ),
    },
    {
      key: 'started_at',
      header: 'تاريخ البدء',
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.started_at ? formatDate(row.started_at) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">تعيين موظفين جدد</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة سجلات الإيبورد وتوليد المستندات
          </p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white gap-2 h-11"
          onClick={() => setWizardOpen(true)}
        >
          <UserPlus className="h-4 w-4" />
          موظف جديد
        </Button>
      </div>

      {/* Table */}
      {!isLoading && rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد سجلات تعيين"
          description="ابدأ بإضافة موظف جديد عبر زر «موظف جديد»"
          actionLabel="موظف جديد"
          onAction={() => setWizardOpen(true)}
        />
      ) : (
        <DataTable<OnboardingListItem>
          columns={columns}
          data={rows}
          loading={isLoading}
          getRowId={(row) => row.id}
          skeletonRows={5}
          onRowClick={(row) =>
            router.push(`/dashboard/hr/onboarding/${row.id}`)
          }
          rowClassName={() =>
            'cursor-pointer hover:bg-muted/40 transition-colors'
          }
        />
      )}

      {/* Wizard dialog */}
      <NewHireWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </div>
  );
}
