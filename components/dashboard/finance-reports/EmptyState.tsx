'use client';

import { FileText } from 'lucide-react';

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
      <FileText className="h-10 w-10 opacity-40" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
