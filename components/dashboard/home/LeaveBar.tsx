'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

export function LeaveBar({ label, value, gradient, maxValue = 30 }: {
  label: string;
  value: number;
  gradient: string;
  maxValue?: number;
}) {
  const percent = Math.min((value / maxValue) * 100, 100);
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground/70">{label}</span>
        <span className="text-sm font-bold">{value} <span className="text-[10px] font-normal text-muted-foreground/50">يوم</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
          className={cn('h-full rounded-full bg-gradient-to-r', gradient)}
        />
      </div>
    </div>
  );
}
