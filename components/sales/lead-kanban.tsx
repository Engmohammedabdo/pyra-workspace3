'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { LeadCard } from './lead-card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Stage {
  id: string;
  name_ar: string;
  color: string;
}

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  source: string;
  priority: string;
  assigned_to?: string;
  stage_id: string;
}

interface LeadKanbanProps {
  stages: Stage[];
  leads: Lead[];
  onRefresh: () => void;
}

const STAGE_BG: Record<string, string> = {
  blue: 'border-t-blue-500',
  yellow: 'border-t-yellow-500',
  orange: 'border-t-orange-500',
  purple: 'border-t-purple-500',
  indigo: 'border-t-indigo-500',
  green: 'border-t-green-500',
  red: 'border-t-red-500',
};

const STAGE_TEXT: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  orange: 'text-orange-600 dark:text-orange-400',
  purple: 'text-purple-600 dark:text-purple-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
};

export function LeadKanban({ stages, leads, onRefresh }: LeadKanbanProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  async function handleDrop(targetStageId: string) {
    if (!draggedLeadId) return;
    const lead = leads.find(l => l.id === draggedLeadId);
    if (!lead || lead.stage_id === targetStageId) {
      setDraggedLeadId(null);
      setDragOverStageId(null);
      return;
    }

    try {
      const res = await fetch(`/api/dashboard/sales/leads/${draggedLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: targetStageId }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم نقل العميل المحتمل');
      onRefresh();
    } catch {
      toast.error('فشل نقل العميل المحتمل');
    } finally {
      setDraggedLeadId(null);
      setDragOverStageId(null);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
      {stages.map(stage => {
        const stageLeads = leads.filter(l => l.stage_id === stage.id);
        const isOver = dragOverStageId === stage.id;

        return (
          <div
            key={stage.id}
            className={cn(
              'flex-shrink-0 w-72 bg-muted/50 rounded-lg border-t-4 flex flex-col',
              STAGE_BG[stage.color] || 'border-t-gray-500',
              isOver && 'ring-2 ring-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20'
            )}
            onDragOver={e => {
              e.preventDefault();
              setDragOverStageId(stage.id);
            }}
            onDragLeave={() => setDragOverStageId(null)}
            onDrop={e => {
              e.preventDefault();
              handleDrop(stage.id);
            }}
          >
            {/* Stage Header */}
            <div className="p-3 flex items-center justify-between border-b">
              <span className={cn('font-semibold text-sm', STAGE_TEXT[stage.color] || 'text-gray-600')}>
                {stage.name_ar}
              </span>
              <Badge variant="secondary" className="text-xs">{stageLeads.length}</Badge>
            </div>

            {/* Leads */}
            <div className="p-2 space-y-2 flex-1 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {stageLeads.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا يوجد عملاء</p>
              ) : (
                stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDraggedLeadId(lead.id)}
                    onDragEnd={() => { setDraggedLeadId(null); setDragOverStageId(null); }}
                    className={cn(draggedLeadId === lead.id && 'opacity-50')}
                  >
                    <LeadCard lead={lead} />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
