'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wallet } from 'lucide-react';
import { usePayrollRuns } from '@/hooks/usePayroll';
import { PayrollRunRow } from '@/components/payroll/PayrollRunRow';

interface Props {
  onCreateRun: () => void;
}

export function PayrollRunsTable({ onCreateRun }: Props) {
  const t = useTranslations('hr.payroll.runsTable');
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { data: runs = [], isLoading: loading } = usePayrollRuns(filterYear);

  const toggleExpandRun = (runId: string) => {
    setExpandedRunId(prev => (prev === runId ? null : runId));
  };

  return (
    <div className="space-y-4">
      {/* Year filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{t('yearLabel')}</span>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map(yr => (
              <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('empty.actionLabel')}
          onAction={onCreateRun}
        />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <PayrollRunRow
              key={run.id}
              run={run}
              isExpanded={expandedRunId === run.id}
              onToggle={toggleExpandRun}
            />
          ))}
        </div>
      )}
    </div>
  );
}
