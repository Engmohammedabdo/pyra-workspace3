'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';

interface LeadsTableProps {
  leads: any[];
  stageMap: Map<string, any>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  onPageChange: (p: number) => void;
  page: number;
  totalPages: number;
  total: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export function LeadsTable({ 
  leads, stageMap, selectedIds, toggleSelect, toggleSelectAll, 
  onPageChange, page, totalPages, total 
}: LeadsTableProps) {
  return (
    <>
      <div className="overflow-x-auto bg-white rounded-2xl shadow-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-10"><Checkbox checked={selectedIds.size === leads.length && leads.length > 0} onCheckedChange={toggleSelectAll} /></th>
              <th className="text-start p-3 font-medium">الاسم</th>
              <th className="text-start p-3 font-medium">النقاط</th>
              <th className="text-start p-3 font-medium">الهاتف</th>
              <th className="text-start p-3 font-medium">المرحلة</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className={cn('border-b hover:bg-muted/30 transition-colors', selectedIds.has(lead.id) && 'bg-orange-50')}>
                <td className="p-3"><Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} /></td>
                <td className="p-3 font-medium hover:text-orange-600"><Link href={`/dashboard/sales/leads/${lead.id}`}>{lead.name}</Link></td>
                <td className="p-3 text-[11px] tabular-nums font-bold flex items-center gap-1"><Star className="h-3 w-3" />{lead.score || 0}</td>
                <td className="p-3 text-muted-foreground" dir="ltr">{lead.phone || '—'}</td>
                <td className="p-3">{stageMap.get(lead.stage_id)?.name_ar || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages} — {total} نتيجة</p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}><ChevronLeft className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </>
  );
}
