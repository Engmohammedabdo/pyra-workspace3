'use client';

import { motion } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface Props {
  today: string;
  onRefresh: () => void;
  loading: boolean;
}

export function WelcomeHero({ today, onRefresh, loading }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent p-6">
      <div className="absolute end-0 top-0 w-64 h-64 rounded-full bg-gradient-to-br from-orange-400/10 to-amber-500/5 -translate-y-1/2 translate-x-1/3 blur-3xl" />
      <div className="absolute start-1/2 bottom-0 w-40 h-40 rounded-full bg-gradient-to-br from-orange-500/5 to-transparent translate-y-1/2 blur-2xl" />
      <div className="absolute end-12 bottom-2 w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-400/8 to-amber-500/4 rotate-12" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-xl shadow-orange-500/20">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">مرحباً بك في Pyra Workspace</h1>
            <p className="text-sm text-muted-foreground/70 mt-0.5">{today}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl hover:bg-orange-500/10"
          onClick={onRefresh}
          aria-label="تحديث البيانات"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
