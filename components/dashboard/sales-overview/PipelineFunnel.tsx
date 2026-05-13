'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart3, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface Props {
  stages: { name_ar: string; color: string; count: number }[];
  totalPipelineLeads: number;
}

const STAGE_GRADIENTS: any = {
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-amber-400 to-amber-500',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  indigo: 'from-indigo-500 to-indigo-600',
  green: 'from-emerald-500 to-emerald-600',
  red: 'from-rose-500 to-rose-600',
};

const STAGE_GLOW: any = {
  blue: 'shadow-blue-500/20',
  yellow: 'shadow-amber-400/20',
  orange: 'shadow-orange-500/20',
  purple: 'shadow-purple-500/20',
  indigo: 'shadow-indigo-500/20',
  green: 'shadow-emerald-500/20',
  red: 'shadow-rose-500/20',
};

export function PipelineFunnel({ stages, totalPipelineLeads }: Props) {
  return (
    <Card className="overflow-hidden border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-base">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            خط المبيعات
          </CardTitle>
          <Link href="/dashboard/crm/pipeline" className="text-xs text-muted-foreground hover:text-orange-500 transition-colors flex items-center gap-1">عرض الكل <ChevronLeft className="h-3 w-3" /></Link>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {stages.map((stage, idx) => {
          const maxCount = Math.max(...stages.map(s => s.count), 1);
          const pct = (stage.count / maxCount) * 100;
          return (
            <motion.div key={idx} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.08 + 0.3 }} className="flex items-center gap-4 py-2">
              <span className="text-sm font-medium w-28 text-end shrink-0 text-muted-foreground">{stage.name_ar}</span>
              <div className="flex-1 bg-muted/50 rounded-full h-8 overflow-hidden relative">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(pct, 3)}%` }} transition={{ delay: idx * 0.08 + 0.5, duration: 0.8 }} className={cn('h-full rounded-full bg-gradient-to-l shadow-md', STAGE_GRADIENTS[stage.color], STAGE_GLOW[stage.color])} />
                {stage.count > 0 && <span className="absolute inset-0 flex items-center ps-3 text-xs font-semibold text-white mix-blend-difference">{totalPipelineLeads > 0 ? `${((stage.count / totalPipelineLeads) * 100).toFixed(0)}%` : ''}</span>}
              </div>
              <div className={cn('w-12 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-gradient-to-br text-white shadow-lg', STAGE_GRADIENTS[stage.color], STAGE_GLOW[stage.color])}>{stage.count}</div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
