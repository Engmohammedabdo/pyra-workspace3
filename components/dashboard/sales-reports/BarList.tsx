'use client';

import { motion } from 'framer-motion';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils/cn';
import { BarChart3 } from 'lucide-react';

export function BarList({ items }: { items: { label: string; value: number; gradient: string }[] }) {
  if (items.length === 0) {
    return <EmptyState icon={BarChart3} title="لا توجد بيانات" className="py-8" />;
  }

  const maxCount = Math.max(...items.map(i => i.value), 1);

  return (
    <div className="space-y-4 pt-2">
      {items.map((item, idx) => {
        const pct = (item.value / maxCount) * 100;
        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06 + 0.3 }}
            className="flex items-center gap-3"
          >
            <span className="text-sm w-24 text-end shrink-0 font-medium text-muted-foreground">{item.label}</span>
            <div className="flex-1 bg-muted/40 rounded-full h-6 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 4)}%` }}
                transition={{ delay: idx * 0.06 + 0.5, duration: 0.7 }}
                className={cn('h-full rounded-full bg-gradient-to-l shadow-sm', item.gradient)}
              />
            </div>
            <div className={cn(
              'w-10 h-6 rounded-lg bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center shadow-sm',
              item.gradient
            )}>
              {item.value}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
