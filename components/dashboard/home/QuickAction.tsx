import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { ArrowUpRight } from 'lucide-react';

export function QuickAction({ href, icon: Icon, label, gradient }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gradient: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl',
        'border border-border/40 bg-card/50',
        'hover:bg-card hover:border-border/80 hover:shadow-sm',
        'transition-all duration-200',
      )}>
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          'bg-gradient-to-br shadow-sm',
          gradient,
        )}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium flex-1">{label}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
      </div>
    </Link>
  );
}
