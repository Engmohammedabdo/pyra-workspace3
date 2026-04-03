'use client';

import { Info } from 'lucide-react';

export function InfoRow({ icon: Icon, label, value, dir }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  dir?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm" dir={dir}>{value || '—'}</p>
      </div>
    </div>
  );
}
