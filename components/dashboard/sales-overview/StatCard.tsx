import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  label: string;
  value: number | string;
  icon: any;
  gradient: string;
  shadowColor: string;
  trend: string | null;
  trendUp: boolean;
}

export function StatCard({ label, value, icon: Icon, gradient, shadowColor, trend, trendUp }: Props) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br text-white shadow-xl', gradient, shadowColor)}>
      <div className="absolute -top-4 -end-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
      <div className="absolute -bottom-6 -start-6 w-32 h-32 bg-white/5 rounded-full" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <Icon className="h-8 w-8 text-white/80" />
          {trend && (
            <div className="flex items-center gap-1 text-[11px] bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-0.5">
              {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend}
            </div>
          )}
        </div>
        <p className="text-4xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-white/70 mt-1">{label}</p>
      </div>
    </div>
  );
}
