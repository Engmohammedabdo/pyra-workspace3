'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import { LucideIcon } from 'lucide-react';

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  subValue?: string;
  colorClass: string;
  bgClass: string;
}

export function SummaryCard({ icon: Icon, label, value, subValue, colorClass, bgClass }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${bgClass} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${colorClass}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold font-mono tabular-nums ${colorClass}`}>
              {formatCurrency(value)}
            </p>
            {subValue && <p className="text-[11px] text-muted-foreground">{subValue}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
