'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SummaryCard({
  title,
  value,
  icon: Icon,
  colorClass,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
