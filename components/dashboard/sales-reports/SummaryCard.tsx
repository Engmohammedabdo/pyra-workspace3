'use client';

import { motion } from 'framer-motion';
import { Users, UserCheck, Target, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function SummaryCard({ label, value, icon: Icon, gradient }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className={cn(
        'relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br text-white shadow-xl',
        gradient
      )}>
        <div className="absolute -top-4 -end-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
        <div className="relative z-10">
          <Icon className="h-7 w-7 text-white/80 mb-3" />
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          <p className="text-sm text-white/70 mt-1">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}
