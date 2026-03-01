'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500',
        className
      )}
    >
      {/* Icon with gradient background */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl scale-150" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-500/10 flex items-center justify-center">
          <Icon className="h-9 w-9 text-orange-500/70" />
        </div>
      </div>

      {/* Text */}
      <h3 className="text-lg font-semibold text-foreground mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-[280px]">
          {description}
        </p>
      )}

      {/* CTA Button */}
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size="sm"
          className="mt-5 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
