'use client';

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Stepper indicator — mirrors NewHireWizard.tsx. */
export function Stepper({ current, steps }: { current: number; steps: { label: string }[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done
                  ? 'bg-orange-500 text-white'
                  : active
                  ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-500 dark:bg-orange-950/50 dark:text-orange-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? '✓' : i + 1}
            </div>
            <span
              className={cn(
                'ms-1.5 me-3 whitespace-nowrap text-xs font-medium',
                active ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn('me-1 h-px w-4 shrink-0', done ? 'bg-orange-500' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Loading placeholder while the exit preview is fetched. */
export function ExitLoading() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/**
 * Fail-closed error surface: the server aborts the handover read on any error
 * rather than returning an empty list, so an errored preview blocks the wizard —
 * the admin can never confirm a blind exit on incomplete data.
 */
export function ExitLoadError({
  title,
  hint,
  retryLabel,
  onRetry,
}: {
  title: string;
  hint: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
        <AlertCircle className="size-7 text-red-600 dark:text-red-400" aria-hidden />
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      <Button type="button" variant="outline" className="h-11" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
