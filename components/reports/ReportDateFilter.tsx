'use client';

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

const presets: { label: string; getRange: () => [string, string] }[] = [
  {
    label: 'هذا الشهر',
    getRange: () => {
      const now = new Date();
      return [startOfMonth(now), toISO(now)];
    },
  },
  {
    label: 'الشهر الماضي',
    getRange: () => {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    },
  },
  {
    label: 'هذا الربع',
    getRange: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return [toISO(start), toISO(now)];
    },
  },
  {
    label: 'آخر 6 أشهر',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      return [toISO(start), toISO(now)];
    },
  },
  {
    label: 'هذه السنة',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return [toISO(start), toISO(now)];
    },
  },
];

export function ReportDateFilter({ from, to, onFromChange, onToChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">من</span>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-[160px] h-9"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">إلى</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-[160px] h-9"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const [f, t] = preset.getRange();
              onFromChange(f);
              onToChange(t);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
