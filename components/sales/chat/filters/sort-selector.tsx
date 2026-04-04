'use client';

import { cn } from '@/lib/utils/cn';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { SortBy } from '../use-chat-store';

interface SortSelectorProps {
  value: SortBy;
  onChange: (sort: SortBy) => void;
}

const SORT_OPTIONS: { key: SortBy; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'newest', label: 'الأحدث أولاً', icon: ArrowDownAZ },
  { key: 'oldest', label: 'الأقدم أولاً', icon: ArrowUpAZ },
  { key: 'priority', label: 'حسب الأولوية', icon: AlertTriangle },
  { key: 'waiting_longest', label: 'أطول انتظار', icon: Clock },
];

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const current = SORT_OPTIONS.find(o => o.key === value) || SORT_OPTIONS[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] rounded-lg text-muted-foreground hover:text-foreground"
          title="ترتيب المحادثات"
        >
          <current.icon className="h-3 w-3 me-1" />
          {current.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start" sideOffset={4}>
        {SORT_OPTIONS.map(option => {
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              onClick={() => onChange(option.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors',
                value === option.key
                  ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 font-medium'
                  : 'hover:bg-muted/50'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {option.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
