'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { LeadCard } from './lead-card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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

const STAGE_GRADIENT: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-amber-400 to-amber-500',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600',
  green: 'from-emerald-500 to-emerald-600',
  red: 'from-rose-500 to-rose-600',
};

const STAGE_ACCENT: Record<string, string> = {
  blue: 'border-t-blue-500 bg-blue-50/30 dark:bg-blue-950/10',
  yellow: 'border-t-amber-400 bg-amber-50/30 dark:bg-amber-950/10',
  orange: 'border-t-orange-500 bg-orange-50/30 dark:bg-orange-950/10',
  purple: 'border-t-purple-500 bg-purple-50/30 dark:bg-purple-950/10',
  indigo: 'border-t-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/10',
  green: 'border-t-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10',
  red: 'border-t-rose-500 bg-rose-50/30 dark:bg-rose-950/10',
};

const STAGE_DROP: Record<string, string> = {
  blue: 'ring-blue-400/40 bg-blue-50/50 dark:bg-blue-950/30',
  yellow: 'ring-amber-400/40 bg-amber-50/50 dark:bg-amber-950/30',
  orange: 'ring-orange-400/40 bg-orange-50/50 dark:bg-orange-950/30',
  purple: 'ring-purple-400/40 bg-purple-50/50 dark:bg-purple-950/30',
  indigo: 'ring-indigo-400/40 bg-indigo-50/50 dark:bg-indigo-950/30',
  green: 'ring-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/30',
  red: 'ring-rose-400/40 bg-rose-50/50 dark:bg-rose-950/30',
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
    <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ minHeight: '420px' }}>
      {stages.map((stage, stageIdx) => {
        const stageLeads = leads.filter(l => l.stage_id === stage.id);
        const isOver = dragOverStageId === stage.id;
        const gradient = STAGE_GRADIENT[stage.color] || 'from-gray-500 to-gray-600';
        const accent = STAGE_ACCENT[stage.color] || 'border-t-gray-500';
        const dropStyle = STAGE_DROP[stage.color] || 'ring-gray-400/40';

        return (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stageIdx * 0.06, duration: 0.4 }}
            className={cn(
              'flex-shrink-0 w-[280px] snap-start rounded-2xl border-t-[3px] flex flex-col transition-all duration-200',
              accent,
              isOver && cn('ring-2 scale-[1.01]', dropStyle)
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
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn('w-2.5 h-2.5 rounded-full bg-gradient-to-br', gradient)} />
                <span className="font-semibold text-sm">{stage.name_ar}</span>
              </div>
              <div className={cn(
                'min-w-[28px] h-6 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shadow-sm',
                gradient
              )}>
                {stageLeads.length}
              </div>
            </div>

            {/* Leads */}
            <div className="px-2.5 pb-3 space-y-2.5 flex-1 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {stageLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center mb-2">
                    <span className="text-muted-foreground/40 text-lg">∅</span>
                  </div>
                  <p className="text-xs text-muted-foreground/60">لا يوجد عملاء</p>
                </div>
              ) : (
                stageLeads.map((lead, idx) => (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03 + stageIdx * 0.06, duration: 0.3 }}
                    draggable
                    onDragStart={() => setDraggedLeadId(lead.id)}
                    onDragEnd={() => { setDraggedLeadId(null); setDragOverStageId(null); }}
                    className={cn(
                      'transition-all duration-150',
                      draggedLeadId === lead.id && 'opacity-40 scale-95 rotate-1'
                    )}
                  >
                    <LeadCard lead={lead} />
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
