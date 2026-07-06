'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';

interface Props {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

function startOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}

function endOfMonth(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
}

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

const presetDefs: { key: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'last6Months' | 'thisYear'; getRange: () => [string, string] }[] = [
  {
    key: 'thisMonth',
    getRange: () => {
      const now = new Date();
      return [startOfMonth(now), toISO(now)];
    },
  },
  {
    key: 'lastMonth',
    getRange: () => {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    },
  },
  {
    key: 'thisQuarter',
    getRange: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return [toISO(start), toISO(now)];
    },
  },
  {
    key: 'last6Months',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      return [toISO(start), toISO(now)];
    },
  },
  {
    key: 'thisYear',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return [toISO(start), toISO(now)];
    },
  },
];

export function ReportDateFilter({ from, to, onFromChange, onToChange }: Props) {
  const t = useTranslations('finance.reports');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{t('dateFilter.from')}</span>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-full sm:w-[160px] h-9"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{t('dateFilter.to')}</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-full sm:w-[160px] h-9"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {presetDefs.map((preset) => (
          <Button
            key={preset.key}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const [f, to2] = preset.getRange();
              onFromChange(f);
              onToChange(to2);
            }}
          >
            {t(`presets.${preset.key}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
