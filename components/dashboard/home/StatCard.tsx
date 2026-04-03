import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';

export function StatCard({ href, title, value, subtitle, icon: Icon, accent, gradient }: {
  href: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  gradient?: string;
}) {
  const gradientClass = gradient || 'from-orange-500 to-amber-600';

  return (
    <Link href={href} className="group block">
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5',
          'shadow-sm hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20',
          'transition-shadow duration-300',
          accent && 'border-s-[3px]',
        )}
        style={accent ? { borderInlineStartColor: accent } : undefined}
      >
        <div className={cn(
          'absolute -top-8 -end-8 w-24 h-24 rounded-full opacity-[0.07] blur-2xl',
          `bg-gradient-to-br ${gradientClass}`,
        )} />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground/80 font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{subtitle}</p>
          </div>
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
            'bg-gradient-to-br shadow-lg',
            gradientClass,
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
