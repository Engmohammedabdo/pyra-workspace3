'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

interface BulkActionsProps {
  count: number;
  stages: { id: string; name_ar: string }[];
  onStageChange: (stageId: string) => void;
  onDelete: () => void;
  loading: boolean;
}

export function BulkActions({ count, stages, onStageChange, onDelete, loading }: BulkActionsProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl animate-in slide-in-from-top-2 duration-200">
      <span className="text-sm font-medium text-orange-700 dark:text-orange-400">{count} محدد</span>
      <div className="flex items-center gap-1 ms-auto">
        <Select onValueChange={onStageChange}>
          <SelectTrigger className="w-36 h-8 text-xs rounded-lg">
            <SelectValue placeholder="نقل لمرحلة..." />
          </SelectTrigger>
          <SelectContent>
            {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="ghost" size="sm" onClick={onDelete} disabled={loading}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg h-8"
        >
          <Trash2 className="h-3.5 w-3.5 me-1" /> حذف
        </Button>
      </div>
    </div>
  );
}
